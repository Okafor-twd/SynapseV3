/**
 * toast.js
 * Theme-aware Toast Notification & Progress View system for Synapse X v3.
 * Supports:
 *   - Native .hw-progress-view in #canvas-progress (matching original Hollywood theme styles)
 *   - .hw-toast floating notifications in #canvas-notifications
 *   - Header, Desc, SubDesc / SubDesk
 *   - Boxicons (bx:info-square, bx:error, bx:error-alt, bx:info-circle, bx:alert-triangle, bx:alert-circle)
 *   - Multi-task support & dynamic updates (in-progress, complete, failure)
 */

(function () {
    const TOAST_ICONS = {
        information: 'bx:info-square',
        info: 'bx:info-square',
        'info-circle': 'bx:info-circle',
        warning: 'bx:error',
        warn: 'bx:error',
        'alert-triangle': 'bx:error',
        error: 'bx:error-alt',
        'alert-circle': 'bx:error-circle',
        'error-circle': 'bx:error-circle',
        success: 'fluent:checkmark-20-filled',
        task: 'fluent:checkmark-20-filled',
        loading: 'svg-spinners:ring-resize',
        print: null
    };

    const TOAST_COLORS = {
        information: '#38bdf8',
        info: '#38bdf8',
        'info-circle': '#38bdf8',
        warning: '#fbbf24',
        warn: '#fbbf24',
        'alert-triangle': '#fbbf24',
        error: '#f87171',
        'alert-circle': '#f87171',
        'error-circle': '#f87171',
        success: '#4ade80',
        task: '#4ade80',
        loading: '#38bdf8',
        print: 'inherit'
    };

    const TOAST_SCALE_KEY = 'synapse_setting_toast_scale';

    function applyToastScale(scaleVal) {
        const scale = parseInt(scaleVal, 10) || 100;
        document.documentElement.style.setProperty('--toast-scale', (scale / 100).toString());
    }

    try {
        const savedScale = localStorage.getItem(TOAST_SCALE_KEY) || '100';
        applyToastScale(savedScale);
    } catch (_) {}

    function resolveHeader(header) {
        if (!header || String(header).trim().toLowerCase() === 'tasks') {
            if (typeof window.i18n?.t === 'function') {
                return window.i18n.t('tasks-header', 'Tasks');
            }
            return 'Tasks';
        }
        return String(header).trim();
    }

    // ── Progress View (.hw-progress-view) ───────────────────────────────────

    // Map: headerKey -> { header, element, tasksList, tasks: Map<taskId, TaskController> }
    const activeProgressViews = new Map();

    function getProgressCanvas() {
        const overlay = document.getElementById('canvas-progress');
        if (!overlay) return null;
        let inner = overlay.querySelector('.progress-canvas-inner');
        if (!inner) {
            inner = overlay.querySelector('.items-end.justify-end');
            if (!inner) {
                inner = document.createElement('div');
                overlay.appendChild(inner);
            }
            inner.className = 'progress-canvas-inner flex h-full w-full select-none items-end justify-end flex-col pointer-events-none overflow-y-auto overflow-x-hidden';
        }
        inner.style.padding = '2rem';
        inner.style.gap = '0.85rem';
        inner.style.boxSizing = 'border-box';
        return inner;
    }

    function ensureProgressView(header = 'Tasks') {
        const canvas = getProgressCanvas();
        if (!canvas) return null;

        const headerKey = resolveHeader(header);

        let viewData = activeProgressViews.get(headerKey);
        if (viewData && document.body.contains(viewData.element)) {
            return viewData;
        }

        // Create new progress view card for this header
        const view = document.createElement('div');
        view.className = 'hw-progress-view flex w-[24rem] flex-col rounded-md border transition-opacity pointer-events-auto flex-shrink-0';
        view.style.animation = '100ms ease-out 0s 1 normal forwards running elem-blur-in';

        const caption = document.createElement('div');
        caption.className = 'caption rounded-t-md border-b p-2 font-bold flex items-center justify-between';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'caption-title select-none';
        titleSpan.textContent = headerKey;
        caption.appendChild(titleSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'caption-actions flex items-center gap-1';

        // Collapse / Expand button
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'caption-btn toast-btn-collapse';
        collapseBtn.title = 'Collapse';
        collapseBtn.innerHTML = '<iconify-icon icon="heroicons:chevron-down" class="text-sm transition-transform duration-200"></iconify-icon>';
        actionsDiv.appendChild(collapseBtn);

        // Close 'X' button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'caption-btn toast-btn-close';
        closeBtn.title = 'Close';
        closeBtn.innerHTML = '<iconify-icon icon="fluent:dismiss-16-regular" class="text-sm"></iconify-icon>';
        actionsDiv.appendChild(closeBtn);

        caption.appendChild(actionsDiv);
        view.appendChild(caption);

        const tasksList = document.createElement('div');
        tasksList.className = 'tasks flex grow flex-col divide-y rounded-b-md';
        view.appendChild(tasksList);

        let isCollapsed = false;
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isCollapsed = !isCollapsed;
            const chevron = collapseBtn.querySelector('iconify-icon');
            if (isCollapsed) {
                tasksList.style.display = 'none';
                if (chevron) chevron.style.transform = 'rotate(-90deg)';
                collapseBtn.title = 'Expand';
            } else {
                tasksList.style.display = 'flex';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
                collapseBtn.title = 'Collapse';
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            HW.dismissHeader(headerKey);
        });

        canvas.appendChild(view);

        viewData = {
            header: headerKey,
            element: view,
            tasksList: tasksList,
            tasks: new Map()
        };
        activeProgressViews.set(headerKey, viewData);
        return viewData;
    }

    function checkProgressViewEmpty(headerKey) {
        const viewData = activeProgressViews.get(headerKey);
        if (!viewData) return;

        if (viewData.tasks.size === 0) {
            activeProgressViews.delete(headerKey);
            viewData.element.style.animation = '100ms ease-in 0s 1 normal forwards running elem-blur-out';
            setTimeout(() => {
                viewData.element.remove();
            }, 100);
        }
    }

    class TaskController {
        constructor(id, element, headerKey, options) {
            this.id = id;
            this.element = element;
            this.headerKey = headerKey;
            this.options = options;
            this.state = options.state || 'in-progress'; // 'in-progress' | 'complete' | 'failure'
            this.timer = null;

            this.iconEl = element.querySelector('.iconify');
            this.descEl = element.querySelector('.task-desc');
            this.subtextEl = element.querySelector('.subtext');
            this.spinnerEl = element.querySelector('.task-spinner');
            const dismissVal = options.autoDismiss !== undefined ? options.autoDismiss : 
                               (options.autodismiss !== undefined ? options.autodismiss : 
                               (options.AutoDismiss !== undefined ? options.AutoDismiss : 
                               (options.duration !== undefined ? options.duration : options.Duration)));
            if (dismissVal) {
                const dur = typeof dismissVal === 'number' ? dismissVal : (dismissVal === true ? 3000 : 0);
                if (dur > 0) {
                    this.timer = setTimeout(() => this.dismiss(), dur);
                }
            }
        }

        update(opts = {}) {
            this.options = { ...this.options, ...opts };

            if (opts.desc !== undefined && this.descEl) {
                this.descEl.textContent = opts.desc || '';
            }
            if (opts.subDesc !== undefined && this.subtextEl) {
                this.subtextEl.textContent = opts.subDesc || '';
                this.subtextEl.style.display = opts.subDesc ? 'block' : 'none';
            }
            if (opts.state !== undefined) {
                this.element.classList.remove('in-progress', 'complete', 'failure');
                this.element.classList.add(opts.state);
                this.state = opts.state;

                if (opts.state === 'complete') {
                    if (this.iconEl) this.iconEl.setAttribute('icon', 'fluent:checkmark-20-filled');
                    if (this.spinnerEl) this.spinnerEl.style.display = 'none';
                } else if (opts.state === 'failure') {
                    if (this.iconEl) this.iconEl.setAttribute('icon', 'bx:error-alt');
                    if (this.spinnerEl) this.spinnerEl.style.display = 'none';
                } else {
                    if (this.spinnerEl) this.spinnerEl.style.display = 'flex';
                }
            }

            const updateDismissVal = opts.autoDismiss !== undefined ? opts.autoDismiss : 
                                    (opts.autodismiss !== undefined ? opts.autodismiss : 
                                    (opts.AutoDismiss !== undefined ? opts.AutoDismiss : 
                                    (opts.duration !== undefined ? opts.duration : opts.Duration)));
            if (updateDismissVal !== undefined) {
                if (this.timer) clearTimeout(this.timer);
                if (updateDismissVal) {
                    const dur = typeof updateDismissVal === 'number' ? updateDismissVal : (updateDismissVal === true ? 3000 : 0);
                    if (dur > 0) {
                        this.timer = setTimeout(() => this.dismiss(), dur);
                    }
                }
            }
        }

        dismiss() {
            const viewData = activeProgressViews.get(this.headerKey);
            if (!viewData || !viewData.tasks.has(this.id)) return;

            if (this.timer) clearTimeout(this.timer);
            viewData.tasks.delete(this.id);

            this.element.style.transition = 'opacity 150ms ease, max-height 150ms ease';
            this.element.style.opacity = '0';
            setTimeout(() => {
                this.element.remove();
                checkProgressViewEmpty(this.headerKey);
                if (typeof this.options.onDismiss === 'function') {
                    this.options.onDismiss();
                }
            }, 150);
        }
    }

    const HW = {
        /**
         * Add a new message / task item into .hw-progress-view for the given header.
         */
        addMessage(config = {}) {
            const rawHeader = config.header || config.Header || config.title || config.Title;
            const header = resolveHeader(rawHeader);
            const desc = config.desc || config.Desc || config.description || config.text || '';
            const subDesc = config.subDesc || config.SubDesc || config.subDesk || config.SubDesk || config.subtext || '';
            const state = config.state || config.status || 'in-progress'; // 'in-progress' | 'complete' | 'failure'
            const icon = config.icon || 'fluent:checkmark-20-filled';

            const viewData = ensureProgressView(header);
            const tasksList = viewData.tasksList;

            const taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
            const taskEl = document.createElement('div');
            taskEl.className = `task ${state} flex items-center`;

            // Left Icon
            const ic = document.createElement('iconify-icon');
            ic.setAttribute('icon', icon);
            ic.className = 'iconify flex items-center justify-center flex-shrink-0';
            ic.style.marginRight = '0.75rem';
            ic.style.fontSize = '1.15rem';
            taskEl.appendChild(ic);

            // Text block
            const textCol = document.createElement('div');
            textCol.className = 'flex flex-col min-w-0 flex-1';

            const descDiv = document.createElement('div');
            descDiv.className = 'task-desc font-bold text-sm truncate';
            descDiv.textContent = desc;
            textCol.appendChild(descDiv);

            const subtextDiv = document.createElement('div');
            subtextDiv.className = 'subtext text-xs truncate';
            subtextDiv.textContent = subDesc;
            if (!subDesc) subtextDiv.style.display = 'none';
            textCol.appendChild(subtextDiv);

            taskEl.appendChild(textCol);

            // Right spinner ring
            const spinnerDiv = document.createElement('div');
            spinnerDiv.className = 'task-spinner ml-auto flex items-center justify-center flex-shrink-0';
            spinnerDiv.innerHTML = `<svg class="animate-spin" viewBox="0 0 100 100" style="width: 1.25rem; height: 1.25rem;">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"></circle>
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="8" stroke-dasharray="100 264" transform="rotate(-90 50 50)"></circle>
            </svg>`;
            if (state !== 'in-progress') spinnerDiv.style.display = 'none';
            taskEl.appendChild(spinnerDiv);

            tasksList.appendChild(taskEl);

            const controller = new TaskController(taskId, taskEl, header, config);
            viewData.tasks.set(taskId, controller);
            return controller;
        },

        addTask(config = {}) {
            return this.addMessage(config);
        },

        dismissHeader(header) {
            const headerKey = resolveHeader(header);
            const viewData = activeProgressViews.get(headerKey);
            if (viewData) {
                viewData.tasks.forEach((ctrl) => ctrl.dismiss());
            }
        },

        dismissAll() {
            activeProgressViews.forEach((viewData) => {
                viewData.tasks.forEach((ctrl) => ctrl.dismiss());
            });
        },

        applyScale(scale) {
            applyToastScale(scale);
        }
    };

    // ── Toast System (.hw-toast in #canvas-notifications) ────────────────────

    function ensureToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            const canvas = document.getElementById('canvas-notifications') || document.body;
            container = document.createElement('div');
            container.id = 'toast-container';
            canvas.appendChild(container);
        }
        return container;
    }

    class ToastController {
        constructor(element, options) {
            this.element = element;
            this.options = options;
            this.timer = null;
            this.progressInterval = null;
            this.isDismissed = false;

            this.headerEl = element.querySelector('.header-text');
            this.descEl = element.querySelector('.hw-toast-desc');
            this.subDescEl = element.querySelector('.hw-toast-subdesc');
            this.iconEl = element.querySelector('.hw-toast-icon');
            this.extraEl = element.querySelector('.hw-toast-extra');
            this.progressFillEl = element.querySelector('.hw-toast-progress-fill');

            this.setupAutoDismiss();
        }

        setupAutoDismiss() {
            const duration = this.options.duration !== undefined ? this.options.duration : 4000;
            if (duration && duration > 0) {
                const startTime = Date.now();
                if (this.progressFillEl) {
                    this.progressFillEl.style.width = '100%';
                    this.progressInterval = setInterval(() => {
                        const elapsed = Date.now() - startTime;
                        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
                        if (this.progressFillEl) {
                            this.progressFillEl.style.width = `${remaining}%`;
                        }
                    }, 50);
                }

                this.timer = setTimeout(() => {
                    this.dismiss();
                }, duration);
            }
        }

        update(newOptions = {}) {
            if (this.isDismissed) return;
            this.options = { ...this.options, ...newOptions };

            // Update Header
            if (this.headerEl && newOptions.header !== undefined) {
                this.headerEl.textContent = newOptions.header || '';
                const headerRow = this.element.querySelector('.hw-toast-header');
                if (headerRow) {
                    headerRow.style.display = newOptions.header ? 'flex' : 'none';
                }
            }

            // Update Desc
            if (this.descEl && newOptions.desc !== undefined) {
                this.descEl.textContent = newOptions.desc || '';
            }

            // Update SubDesc
            if (this.subDescEl && newOptions.subDesc !== undefined) {
                this.subDescEl.textContent = newOptions.subDesc || '';
                this.subDescEl.style.display = newOptions.subDesc ? 'block' : 'none';
            }

            // Update Icon
            if (this.iconEl && (newOptions.icon !== undefined || newOptions.type !== undefined || newOptions.iconColor !== undefined)) {
                const type = newOptions.type || this.options.type || 'info';
                let iconName = newOptions.icon;
                if (iconName === undefined) {
                    iconName = TOAST_ICONS[type] !== undefined ? TOAST_ICONS[type] : 'bx:info-square';
                }
                const iconColor = newOptions.iconColor || TOAST_COLORS[type] || 'inherit';

                this.iconEl.innerHTML = '';
                if (iconName) {
                    const ic = document.createElement('iconify-icon');
                    ic.setAttribute('icon', iconName);
                    ic.style.color = iconColor;
                    this.iconEl.appendChild(ic);
                    this.iconEl.style.display = 'flex';
                } else {
                    this.iconEl.style.display = 'none';
                }
            }

            // Update Extra / Spinner
            if (this.extraEl && (newOptions.spinner !== undefined || newOptions.spinnerColor !== undefined)) {
                this.extraEl.innerHTML = '';
                if (newOptions.spinner) {
                    const color = newOptions.spinnerColor || '#4ade80';
                    this.extraEl.innerHTML = `<svg class="animate-spin" viewBox="0 0 100 100" style="width: 1.25rem; height: 1.25rem;">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"></circle>
                        <circle cx="50" cy="50" r="42" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="100 264" transform="rotate(-90 50 50)"></circle>
                    </svg>`;
                    this.extraEl.style.display = 'flex';
                } else {
                    this.extraEl.style.display = 'none';
                }
            }
        }

        dismiss() {
            if (this.isDismissed) return;
            this.isDismissed = true;

            if (this.timer) clearTimeout(this.timer);
            if (this.progressInterval) clearInterval(this.progressInterval);

            this.element.classList.add('dismissing');
            setTimeout(() => {
                this.element.remove();
                if (typeof this.options.onDismiss === 'function') {
                    this.options.onDismiss();
                }
            }, 180);
        }
    }

    const HWToast = {
        /**
         * Spawn a new toast notification.
         */
        spawn(config = {}) {
            // If mode is 'task' or 'progress' and user specifies progress container, route to HW
            if (config.useProgressView) {
                return HW.addMessage(config);
            }

            const container = ensureToastContainer();

            const header = config.header || config.Header || '';
            const desc = config.desc || config.Desc || '';
            const subDesc = config.subDesc || config.SubDesc || config.subDesk || config.SubDesk || '';
            const type = (config.type || 'info').toLowerCase();
            const closable = config.closable !== false;
            const spinner = !!config.spinner || type === 'task' || type === 'loading';
            const spinnerColor = config.spinnerColor || (type === 'task' ? '#4ade80' : '#38bdf8');

            let iconName = config.icon;
            if (iconName === undefined) {
                iconName = TOAST_ICONS[type] !== undefined ? TOAST_ICONS[type] : 'bx:info-square';
            }
            const iconColor = config.iconColor || TOAST_COLORS[type] || 'inherit';

            const toast = document.createElement('div');
            toast.className = 'hw-toast';

            // Optional Header Row
            const headerRow = document.createElement('div');
            headerRow.className = 'hw-toast-header';
            if (!header) headerRow.style.display = 'none';

            const headerTitle = document.createElement('span');
            headerTitle.className = 'header-text';
            headerTitle.textContent = header;
            headerRow.appendChild(headerTitle);

            if (closable) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'toast-close';
                closeBtn.title = 'Dismiss';
                closeBtn.innerHTML = '<iconify-icon icon="fluent:dismiss-12-filled"></iconify-icon>';
                headerRow.appendChild(closeBtn);
            }
            toast.appendChild(headerRow);

            // Main Body Row
            const bodyRow = document.createElement('div');
            bodyRow.className = 'hw-toast-body';

            // Left Icon
            const iconDiv = document.createElement('div');
            iconDiv.className = 'hw-toast-icon';
            if (iconName && type !== 'print') {
                const ic = document.createElement('iconify-icon');
                ic.setAttribute('icon', iconName);
                ic.style.color = iconColor;
                iconDiv.appendChild(ic);
            } else {
                iconDiv.style.display = 'none';
            }
            bodyRow.appendChild(iconDiv);

            // Text Column (Desc + SubDesc)
            const textDiv = document.createElement('div');
            textDiv.className = 'hw-toast-text';

            const descDiv = document.createElement('div');
            descDiv.className = 'hw-toast-desc';
            descDiv.textContent = desc;
            textDiv.appendChild(descDiv);

            const subDescDiv = document.createElement('div');
            subDescDiv.className = 'hw-toast-subdesc';
            subDescDiv.textContent = subDesc;
            if (!subDesc) subDescDiv.style.display = 'none';
            textDiv.appendChild(subDescDiv);

            bodyRow.appendChild(textDiv);

            // Right Extra Widget (Spinner / Ring)
            const extraDiv = document.createElement('div');
            extraDiv.className = 'hw-toast-extra';
            if (spinner) {
                extraDiv.innerHTML = `<svg class="animate-spin" viewBox="0 0 100 100" style="width: 1.25rem; height: 1.25rem;">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"></circle>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="${spinnerColor}" stroke-width="8" stroke-dasharray="100 264" transform="rotate(-90 50 50)"></circle>
                </svg>`;
            } else {
                extraDiv.style.display = 'none';
            }
            bodyRow.appendChild(extraDiv);

            toast.appendChild(bodyRow);

            // Bottom Progress bar (Optional)
            if (config.showProgress) {
                const progressTrack = document.createElement('div');
                progressTrack.className = 'hw-toast-progress-bar';
                const progressFill = document.createElement('div');
                progressFill.className = 'hw-toast-progress-fill';
                progressTrack.appendChild(progressFill);
                toast.appendChild(progressTrack);
            }

            // Click handling
            if (typeof config.onClick === 'function') {
                toast.style.cursor = 'pointer';
                toast.addEventListener('click', (e) => {
                    if (e.target.closest('.toast-close')) return;
                    config.onClick(e);
                });
            }

            container.appendChild(toast);

            const controller = new ToastController(toast, config);

            const closeBtnEl = toast.querySelector('.toast-close');
            if (closeBtnEl) {
                closeBtnEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    controller.dismiss();
                });
            }

            return controller;
        },

        show(config) {
            return this.spawn(config);
        },

        info(desc, subDesc = '', header = 'Information', options = {}) {
            return this.spawn({ header, desc, subDesc, type: 'info', ...options });
        },

        warn(desc, subDesc = '', header = 'Warning', options = {}) {
            return this.spawn({ header, desc, subDesc, type: 'warning', ...options });
        },

        error(desc, subDesc = '', header = 'Error', options = {}) {
            return this.spawn({ header, desc, subDesc, type: 'error', ...options });
        },

        success(desc, subDesc = '', header = 'Success', options = {}) {
            return this.spawn({ header, desc, subDesc, type: 'success', ...options });
        },

        task(desc, subDesc = '', header = 'Tasks', options = {}) {
            // Task matching screenshot uses the native .hw-progress-view via HW.addMessage!
            return HW.addMessage({ header, desc, subDesc, ...options });
        },

        print(desc, subDesc = '', header = '', options = {}) {
            return this.spawn({ header, desc, subDesc, type: 'print', ...options });
        }
    };

    window.HW = HW;
    window.HWProgress = HW;
    window.HWToast = HWToast;
    window.showToast = (config) => HWToast.spawn(config);
})();