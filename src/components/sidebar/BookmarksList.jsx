import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../../context/EditorContext';
import { themeService } from '../../services/themeService';
import { i18n } from '../../services/i18nService';

export function BookmarksList({ searchQuery = '' }) {
    const { openFileInEditor } = useEditor();
    const [bookmarks, setBookmarks] = useState([]);
    const [contextMenu, setContextMenu] = useState(null);

    const loadBookmarks = async () => {
        try {
            const list = (await window.hwAPI?.getSetting?.('bookmarks', [])) || [];
            setBookmarks(list);
        } catch (_) {}
    };

    useEffect(() => {
        loadBookmarks();
    }, []);

    const fetchScript = async (url) => {
        if (window.hwAPI?.fetchUrl) {
            const res = await window.hwAPI.fetchUrl(url);
            if (res && res.text) return res.text;
        }
        const res = await fetch(url);
        return await res.text();
    };

    const handleBookmarkClick = async (item) => {
        const name = typeof item === 'object' && item.name ? item.name : (typeof item === 'string' ? item.split('/').pop() : 'Bookmark');
        const uri = typeof item === 'object' && item.uri ? item.uri : (typeof item === 'string' ? item : '');

        try {
            const content = await fetchScript(uri);
            openFileInEditor(name, content, { bookmarkUri: uri, isBookmark: true });
        } catch (e) {
            window.HWToast?.error?.('Failed to load bookmark', e.message);
        }
    };

    const handleContextMenu = (e, item, index) => {
        e.preventDefault();
        e.stopPropagation();

        const appEl = document.getElementById('application') || document.body;
        const appRect = appEl.getBoundingClientRect();
        const posX = Math.max(10, e.clientX - appRect.left);
        const posY = Math.max(10, e.clientY - appRect.top);

        setContextMenu({
            x: posX,
            y: posY,
            item,
            index
        });
    };

    useEffect(() => {
        if (!contextMenu) return;

        const handleClick = (e) => {
            if (!e.target.closest('.hw-contextmenu')) {
                setContextMenu(null);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setContextMenu(null);
        };

        const timer = setTimeout(() => {
            document.addEventListener('click', handleClick);
            document.addEventListener('contextmenu', handleClick);
        }, 10);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', handleClick);
            document.removeEventListener('contextmenu', handleClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu]);

    const handleAction = async (action) => {
        if (!contextMenu) return;
        const { item, index } = contextMenu;
        setContextMenu(null);

        const name = typeof item === 'object' && item.name ? item.name : (typeof item === 'string' ? item.split('/').pop() : 'Bookmark');
        const uri = typeof item === 'object' && item.uri ? item.uri : (typeof item === 'string' ? item : '');

        switch (action) {
            case 'execute': {
                try {
                    const content = await fetchScript(uri);
                    window.hwAPI?.execute?.(content);
                } catch (e) {
                    window.HWToast?.error?.('Execution failed', e.message);
                }
                break;
            }
            case 'open':
                handleBookmarkClick(item);
                break;
            case 'open-in-browser':
                if (window.hwAPI?.openExternal) window.hwAPI.openExternal(uri);
                else window.open(uri, '_blank');
                break;
            case 'copy-link':
                navigator.clipboard.writeText(uri);
                break;
            case 'delete': {
                const next = bookmarks.filter((_, i) => i !== index);
                setBookmarks(next);
                await window.hwAPI?.setSetting?.('bookmarks', next);
                break;
            }
        }
    };

    const q = searchQuery.trim().toLowerCase();
    const filtered = q
        ? bookmarks.filter(item => {
            const name = typeof item === 'object' && item.name ? item.name : (typeof item === 'string' ? item.split('/').pop() : 'Bookmark');
            const uri = typeof item === 'object' && item.uri ? item.uri : (typeof item === 'string' ? item : '');
            return name.toLowerCase().includes(q) || uri.toLowerCase().includes(q);
        })
        : bookmarks;

    const bookmarkIconName = themeService.getThemeIcon('file', 'fluent:document-20-filled');

    return (
        <>
            {filtered.map((item, index) => {
                const name = typeof item === 'object' && item.name ? item.name : (typeof item === 'string' ? item.split('/').pop() : 'Bookmark');
                const uri = typeof item === 'object' && item.uri ? item.uri : (typeof item === 'string' ? item : '');

                return (
                    <div key={index} className="node">
                        <div>
                            <div
                                className="node-caption group flex items-center py-0.5 pl-1 opacity-70 hover:opacity-100 active:opacity-50 cursor-default"
                                draggable="true"
                                title={uri || name}
                                onClick={() => handleBookmarkClick(item)}
                                onContextMenu={(e) => handleContextMenu(e, item, index)}
                            >
                                <iconify-icon
                                    icon={bookmarkIconName}
                                    class="flex items-center justify-center w-4 min-w-[1rem]"
                                />
                                <div className="ml-2 overflow-ellipsis whitespace-nowrap">{name}</div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {contextMenu && createPortal(
                <div
                    className="hw-contextmenu pointer-events-auto absolute flex flex-col rounded-md"
                    style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px`, zIndex: 1000 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default"
                        onClick={() => handleAction('execute')}
                    >
                        <iconify-icon icon="fluent:play-20-regular" class="flex items-center justify-center" />
                        <span>{i18n.t('contextmenu-execute', 'Execute')}</span>
                    </div>
                    <div
                        className="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default"
                        onClick={() => handleAction('open')}
                    >
                        <iconify-icon icon="fluent:document-arrow-up-20-filled" class="flex items-center justify-center" />
                        <span>{i18n.t('contextmenu-open', 'Open')}</span>
                    </div>
                    <div
                        className="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default"
                        onClick={() => handleAction('open-in-browser')}
                    >
                        <iconify-icon icon="fluent:globe-20-regular" class="flex items-center justify-center" />
                        <span>{i18n.t('contextmenu-open-in-browser', 'Open in browser')}</span>
                    </div>
                    <div
                        className="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default"
                        onClick={() => handleAction('copy-link')}
                    >
                        <iconify-icon icon="fluent:copy-20-filled" class="flex items-center justify-center" />
                        <span>{i18n.t('contextmenu-copy-share-link', 'Copy share link')}</span>
                    </div>
                    <div
                        className="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default"
                        onClick={() => handleAction('delete')}
                    >
                        <iconify-icon icon="fluent:delete-20-filled" class="flex items-center justify-center" />
                        <span>{i18n.t('contextmenu-delete', 'Delete')}</span>
                    </div>
                </div>,
                document.getElementById('canvas-menus') || document.body
            )}
        </>
    );
}
