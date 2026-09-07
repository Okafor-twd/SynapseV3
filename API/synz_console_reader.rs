// synz_console_reader.rs
// Lightweight, zero-dependency Win32 named-pipe reader for Synapse Z console redirection.
// Uses native Windows kernel32 message-mode pipes (exact same logic as synapsezapi.rs).

use std::env;
use std::ffi::c_void;
use std::io::{self, Write};
use std::thread;
use std::time::Duration;

type HANDLE = *mut c_void;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;
const GENERIC_READ: u32 = 0x80000000;
const GENERIC_WRITE: u32 = 0x40000000;
const FILE_SHARE_READ: u32 = 0x00000001;
const FILE_SHARE_WRITE: u32 = 0x00000002;
const OPEN_EXISTING: u32 = 3;
const FILE_ATTRIBUTE_NORMAL: u32 = 0x80;
const PIPE_READMODE_MESSAGE: u32 = 0x00000002;

#[link(name = "kernel32")]
extern "system" {
    fn CreateFileA(
        lpFileName: *const u8,
        dwDesiredAccess: u32,
        dwShareMode: u32,
        lpSecurityAttributes: *mut c_void,
        dwCreationDisposition: u32,
        dwFlagsAndAttributes: u32,
        hTemplateFile: HANDLE,
    ) -> HANDLE;

    fn CloseHandle(hObject: HANDLE) -> i32;

    fn ReadFile(
        hFile: HANDLE,
        lpBuffer: *mut u8,
        nNumberOfBytesToRead: u32,
        lpNumberOfBytesRead: *mut u32,
        lpOverlapped: *mut c_void,
    ) -> i32;

    fn WriteFile(
        hFile: HANDLE,
        lpBuffer: *const u8,
        nNumberOfBytesToWrite: u32,
        lpNumberOfBytesWritten: *mut u32,
        lpOverlapped: *mut c_void,
    ) -> i32;

    fn WaitNamedPipeA(lpNamedPipeName: *const u8, nTimeOut: u32) -> i32;

    fn SetNamedPipeHandleState(
        hNamedPipe: HANDLE,
        lpMode: *const u32,
        lpMaxCollectionCount: *mut u32,
        lpCollectDataTimeout: *mut u32,
    ) -> i32;

    fn PeekNamedPipe(
        hNamedPipe: HANDLE,
        lpBuffer: *mut u8,
        nBufferSize: u32,
        lpBytesRead: *mut u32,
        lpTotalBytesAvail: *mut u32,
        lpBytesLeftThisMessage: *mut u32,
    ) -> i32;
}

fn escape_json(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\x08' => out.push_str("\\b"),
            '\x0C' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

fn emit_output(pid: u32, out_type: i32, content: &str) {
    let json = format!(
        "{{\"pid\":{},\"type\":{},\"content\":\"{}\"}}",
        pid,
        out_type,
        escape_json(content)
    );
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", json);
    let _ = handle.flush();
}

fn parse_and_emit(pid: u32, line: &str) {
    if let Some((cmd, payload)) = line.split_once(' ') {
        if cmd == "output" {
            if let Some((type_str, output)) = payload.split_once(' ') {
                if let Ok(t) = type_str.parse::<i32>() {
                    emit_output(pid, t, output);
                }
            }
        } else if cmd == "error" {
            emit_output(pid, 3, payload);
        }
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: synz_console_reader <PID>");
        std::process::exit(1);
    }

    let pid: u32 = match args[1].parse() {
        Ok(p) => p,
        Err(_) => {
            eprintln!("Invalid PID: {}", args[1]);
            std::process::exit(1);
        }
    };

    let main_pipe_name = format!("\\\\.\\pipe\\synz-{}\0", pid);

    // 1. Connect to main pipe and request new session pipe
    let mut session_pipe_name = String::new();

    unsafe {
        if WaitNamedPipeA(main_pipe_name.as_ptr(), 5000) == 0 {
            eprintln!("WaitNamedPipeA timeout for {}", args[1]);
            std::process::exit(2);
        }

        let h_main = CreateFileA(
            main_pipe_name.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );

        if h_main == INVALID_HANDLE_VALUE {
            eprintln!("Failed to open main pipe for PID {}", pid);
            std::process::exit(3);
        }

        let mode: u32 = PIPE_READMODE_MESSAGE;
        SetNamedPipeHandleState(h_main, &mode, std::ptr::null_mut(), std::ptr::null_mut());

        let cmd_new = b"new";
        let mut written: u32 = 0;
        WriteFile(
            h_main,
            cmd_new.as_ptr(),
            cmd_new.len() as u32,
            &mut written,
            std::ptr::null_mut(),
        );

        let mut avail: u32 = 0;
        for _ in 0..50 {
            if PeekNamedPipe(
                h_main,
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                &mut avail,
                std::ptr::null_mut(),
            ) != 0
                && avail > 0
            {
                let mut buf = vec![0u8; avail as usize];
                let mut read_bytes: u32 = 0;
                ReadFile(
                    h_main,
                    buf.as_mut_ptr(),
                    avail,
                    &mut read_bytes,
                    std::ptr::null_mut(),
                );
                if let Ok(name) = String::from_utf8(buf) {
                    let clean = name.trim_matches(char::from(0)).trim();
                    session_pipe_name = if clean.starts_with(r"\\.\pipe\") {
                        clean.to_string()
                    } else {
                        format!(r"\\.\pipe\{}", clean)
                    };
                    break;
                }
            }
            thread::sleep(Duration::from_millis(20));
        }

        CloseHandle(h_main);
    }

    if session_pipe_name.is_empty() {
        eprintln!("Failed to obtain session pipe name for PID {}", pid);
        std::process::exit(4);
    }

    // 2. Connect to the session pipe and run message loop
    let session_pipe_cstring = format!("{}\0", session_pipe_name);

    unsafe {
        if WaitNamedPipeA(session_pipe_cstring.as_ptr(), 5000) == 0 {
            eprintln!("WaitNamedPipeA timeout for session pipe {}", session_pipe_name);
            std::process::exit(5);
        }

        let h_session = CreateFileA(
            session_pipe_cstring.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );

        if h_session == INVALID_HANDLE_VALUE {
            eprintln!("Failed to open session pipe {}", session_pipe_name);
            std::process::exit(6);
        }

        let mode: u32 = PIPE_READMODE_MESSAGE;
        SetNamedPipeHandleState(h_session, &mode, std::ptr::null_mut(), std::ptr::null_mut());

        // Emit ready signal
        emit_output(pid, 1, "Console redirection active.");

        loop {
            // Send "1" (number of commands)
            let q_len_str = b"1";
            let mut written: u32 = 0;
            if WriteFile(
                h_session,
                q_len_str.as_ptr(),
                q_len_str.len() as u32,
                &mut written,
                std::ptr::null_mut(),
            ) == 0
            {
                break;
            }

            // Send "read"
            let cmd_read = b"read";
            if WriteFile(
                h_session,
                cmd_read.as_ptr(),
                cmd_read.len() as u32,
                &mut written,
                std::ptr::null_mut(),
            ) == 0
            {
                break;
            }

            // Read response count
            let mut size: u32 = 0;
            for _ in 0..10 {
                if PeekNamedPipe(
                    h_session,
                    std::ptr::null_mut(),
                    0,
                    std::ptr::null_mut(),
                    &mut size,
                    std::ptr::null_mut(),
                ) != 0
                    && size > 0
                {
                    break;
                }
                thread::sleep(Duration::from_millis(5));
            }

            if size > 0 {
                let mut b = vec![0u8; size as usize];
                let mut read_bytes: u32 = 0;
                ReadFile(
                    h_session,
                    b.as_mut_ptr(),
                    size,
                    &mut read_bytes,
                    std::ptr::null_mut(),
                );

                if let Ok(s) = String::from_utf8(b) {
                    if let Ok(n) = s.trim_matches(char::from(0)).trim().parse::<u64>() {
                        for _ in 0..n {
                            let mut ds: u32 = 0;
                            for _ in 0..10 {
                                if PeekNamedPipe(
                                    h_session,
                                    std::ptr::null_mut(),
                                    0,
                                    std::ptr::null_mut(),
                                    &mut ds,
                                    std::ptr::null_mut(),
                                ) != 0
                                    && ds > 0
                                {
                                    break;
                                }
                                thread::sleep(Duration::from_millis(2));
                            }

                            if ds > 0 {
                                let mut db = vec![0u8; ds as usize];
                                let mut d_read: u32 = 0;
                                ReadFile(
                                    h_session,
                                    db.as_mut_ptr(),
                                    ds,
                                    &mut d_read,
                                    std::ptr::null_mut(),
                                );
                                if let Ok(ds_str) = String::from_utf8(db) {
                                    let clean = ds_str.trim_matches(char::from(0)).trim();
                                    if !clean.is_empty() {
                                        parse_and_emit(pid, clean);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            thread::sleep(Duration::from_millis(100));
        }

        CloseHandle(h_session);
    }
}
