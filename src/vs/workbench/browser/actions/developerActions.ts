/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import { localize } from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { DomEmitter } from 'vs/base/browser/event';
import { Color } from 'vs/base/common/color';
import { Event } from 'vs/base/common/event';
import { IDisposable, toDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { getDomNodePagePosition, createStyleSheet, createCSSRule, append, $ } from 'vs/base/browser/dom';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Context } from 'vs/platform/contextkey/browser/contextKeyService';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { RunOnceScheduler } from 'vs/base/common/async';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerAction2, Action2, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { clamp } from 'vs/base/common/numbers';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';

class InspectContextKeysAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.inspectContextKeys',
			title: { value: localize('inspect context keys', "Inspect Context Keys"), original: 'Inspect Context Keys' },
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const contextKeyService = accessor.get(IContextKeyService);

		const disposables = new DisposableStore();

		const stylesheet = createStyleSheet();
		disposables.add(toDisposable(() => {
			stylesheet.parentNode?.removeChild(stylesheet);
		}));
		createCSSRule('*', 'cursor: crosshair !important;', stylesheet);

		const hoverFeedback = document.createElement('div');
		document.body.appendChild(hoverFeedback);
		disposables.add(toDisposable(() => document.body.removeChild(hoverFeedback)));

		hoverFeedback.style.position = 'absolute';
		hoverFeedback.style.pointerEvents = 'none';
		hoverFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
		hoverFeedback.style.zIndex = '1000';

		const onMouseMove = disposables.add(new DomEmitter(document.body, 'mousemove', true));
		disposables.add(onMouseMove.event(e => {
			const target = e.target as HTMLElement;
			const position = getDomNodePagePosition(target);

			hoverFeedback.style.top = `${position.top}px`;
			hoverFeedback.style.left = `${position.left}px`;
			hoverFeedback.style.width = `${position.width}px`;
			hoverFeedback.style.height = `${position.height}px`;
		}));

		const onMouseDown = disposables.add(new DomEmitter(document.body, 'mousedown', true));
		Event.once(onMouseDown.event)(e => { e.preventDefault(); e.stopPropagation(); }, null, disposables);

		const onMouseUp = disposables.add(new DomEmitter(document.body, 'mouseup', true));
		Event.once(onMouseUp.event)(e => {
			e.preventDefault();
			e.stopPropagation();

			const context = contextKeyService.getContext(e.target as HTMLElement) as Context;
			console.log(context.collectAllValues());

			dispose(disposables);
		}, null, disposables);
	}
}

class ToggleScreencastModeAction extends Action2 {

	static disposable: IDisposable | undefined;

	constructor() {
		super({
			id: 'workbench.action.toggleScreencastMode',
			title: { value: localize('toggle screencast mode', "Toggle Screencast Mode"), original: 'Toggle Screencast Mode' },
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		if (ToggleScreencastModeAction.disposable) {
			ToggleScreencastModeAction.disposable.dispose();
			ToggleScreencastModeAction.disposable = undefined;
			return;
		}

		const layoutService = accessor.get(ILayoutService);
		const configurationService = accessor.get(IConfigurationService);
		const keybindingService = accessor.get(IKeybindingService);

		const disposables = new DisposableStore();

		const container = layoutService.container;
		const mouseMarker = append(container, $('.screencast-mouse'));
		disposables.add(toDisposable(() => mouseMarker.remove()));

		const onMouseDown = disposables.add(new DomEmitter(container, 'mousedown', true));
		const onMouseUp = disposables.add(new DomEmitter(container, 'mouseup', true));
		const onMouseMove = disposables.add(new DomEmitter(container, 'mousemove', true));

		const updateMouseIndicatorColor = () => {
			mouseMarker.style.borderColor = Color.fromHex(configurationService.getValue<string>('screencastMode.mouseIndicatorColor')).toString();
		};

		let mouseIndicatorSize: number;
		const updateMouseIndicatorSize = () => {
			mouseIndicatorSize = clamp(configurationService.getValue<number>('screencastMode.mouseIndicatorSize') || 20, 20, 100);

			mouseMarker.style.height = `${mouseIndicatorSize}px`;
			mouseMarker.style.width = `${mouseIndicatorSize}px`;
		};

		updateMouseIndicatorColor();
		updateMouseIndicatorSize();

		disposables.add(onMouseDown.event(e => {
			mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
			mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
			mouseMarker.style.display = 'block';
			mouseMarker.style.transform = `scale(${1})`;
			mouseMarker.style.transition = 'transform 0.1s';

			const mouseMoveListener = onMouseMove.event(e => {
				mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
				mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
				mouseMarker.style.transform = `scale(${.8})`;
			});

			Event.once(onMouseUp.event)(() => {
				mouseMarker.style.display = 'none';
				mouseMoveListener.dispose();
			});
		}));

		const keyboardMarker = append(container, $('.screencast-keyboard'));
		disposables.add(toDisposable(() => keyboardMarker.remove()));

		const updateKeyboardFontSize = () => {
			keyboardMarker.style.fontSize = `${clamp(configurationService.getValue<number>('screencastMode.fontSize') || 56, 20, 100)}px`;
		};

		const updateKeyboardMarker = () => {
			keyboardMarker.style.bottom = `${clamp(configurationService.getValue<number>('screencastMode.verticalOffset') || 0, 0, 90)}%`;
		};

		let keyboardMarkerTimeout!: number;
		const updateKeyboardMarkerTimeout = () => {
			keyboardMarkerTimeout = clamp(configurationService.getValue<number>('screencastMode.keyboardOverlayTimeout') || 800, 500, 5000);
		};

		updateKeyboardFontSize();
		updateKeyboardMarker();
		updateKeyboardMarkerTimeout();

		disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('screencastMode.verticalOffset')) {
				updateKeyboardMarker();
			}

			if (e.affectsConfiguration('screencastMode.fontSize')) {
				updateKeyboardFontSize();
			}

			if (e.affectsConfiguration('screencastMode.keyboardOverlayTimeout')) {
				updateKeyboardMarkerTimeout();
			}

			if (e.affectsConfiguration('screencastMode.mouseIndicatorColor')) {
				updateMouseIndicatorColor();
			}

			if (e.affectsConfiguration('screencastMode.mouseIndicatorSize')) {
				updateMouseIndicatorSize();
			}
		}));

		const onKeyDown = disposables.add(new DomEmitter(window, 'keydown', true));
		const onCompositionUpdate = disposables.add(new DomEmitter(window, 'compositionupdate', true));
		const onCompositionEnd = disposables.add(new DomEmitter(window, 'compositionend', true));

		let length = 0;
		let composing: Element | undefined = undefined;

		const clearKeyboardScheduler = new RunOnceScheduler(() => {
			keyboardMarker.textContent = '';
			composing = undefined;
			length = 0;
		}, keyboardMarkerTimeout);

		disposables.add(onCompositionUpdate.event(e => {
			if (e.data) {
				composing = composing ?? append(keyboardMarker, $('span.key'));
				composing.textContent = e.data;
			}

			clearKeyboardScheduler.schedule();
		}));

		disposables.add(onCompositionEnd.event(e => {
			composing = undefined;
		}));

		disposables.add(onKeyDown.event(e => {
			if (e.key === 'Process') {
				if (!e.code.includes('Key')) {
					composing = undefined;
					clearKeyboardScheduler.cancel();
				}

				return;
			}

			const event = new StandardKeyboardEvent(e);
			const shortcut = keybindingService.softDispatch(event, event.target);

			// Hide the single arrow key pressed
			if (shortcut?.commandId && configurationService.getValue('screencastMode.hideSingleEditorCursorMoves') && (
				['cursorLeft', 'cursorRight', 'cursorUp', 'cursorDown'].includes(shortcut.commandId))
			) {
				return;
			}

			if (shortcut?.commandId || !configurationService.getValue('screencastMode.onlyKeyboardShortcuts')) {
				if (
					event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
					|| length > 20
					|| event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Escape
					|| event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.DownArrow
					|| event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.RightArrow
				) {
					keyboardMarker.innerText = '';
					length = 0;
				}

				const format = configurationService.getValue<'keys' | 'command' | 'commandWithGroup' | 'commandAndKeys' | 'commandWithGroupAndKeys'>('screencastMode.keyboardShortcutsFormat');
				const keybinding = keybindingService.resolveKeyboardEvent(event);
				const command = shortcut?.commandId ? MenuRegistry.getCommand(shortcut.commandId) : null;

				let titleLabel = '';
				let keyLabel: string | undefined | null = keybinding.getLabel();

				if (command) {
					titleLabel = typeof command.title === 'string' ? command.title : command.title.value;

					if ((format === 'commandWithGroup' || format === 'commandWithGroupAndKeys') && command.category) {
						titleLabel = `${typeof command.category === 'string' ? command.category : command.category.value}: ${titleLabel} `;
					}

					if (shortcut?.commandId) {
						const keybindings = keybindingService.lookupKeybindings(shortcut.commandId)
							.filter(k => k.getLabel()?.endsWith(keyLabel ?? ''));

						if (keybindings.length > 0) {
							keyLabel = keybindings[keybindings.length - 1].getLabel();
						}
					}
				}

				if (format !== 'keys' && titleLabel) {
					append(keyboardMarker, $('span.title', {}, `${titleLabel} `));
				}

				if (!configurationService.getValue('screencastMode.onlyKeyboardShortcuts') || !titleLabel || shortcut?.commandId && (format === 'keys' || format === 'commandAndKeys' || format === 'commandWithGroupAndKeys')) {
					// Fix label for arrow keys
					keyLabel = keyLabel?.replace('UpArrow', '↑')
						?.replace('DownArrow', '↓')
						?.replace('LeftArrow', '←')
						?.replace('RightArrow', '→');

					append(keyboardMarker, $('span.key', {}, keyLabel ?? ''));
				}

				length++;
			}

			clearKeyboardScheduler.schedule();
		}));

		ToggleScreencastModeAction.disposable = disposables;
	}
}

class LogStorageAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.logStorage',
			title: { value: localize({ key: 'logStorage', comment: ['A developer only action to log the contents of the storage for the current window.'] }, "Log Storage Database Contents"), original: 'Log Storage Database Contents' },
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).log();
	}
}

class LogWorkingCopiesAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.logWorkingCopies',
			title: { value: localize({ key: 'logWorkingCopies', comment: ['A developer only action to log the working copies that exist.'] }, "Log Working Copies"), original: 'Log Working Copies' },
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workingCopyService = accessor.get(IWorkingCopyService);
		const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
		const logService = accessor.get(ILogService);

		const backups = await workingCopyBackupService.getBackups();

		const msg = [
			``,
			`[Working Copies]`,
			...(workingCopyService.workingCopies.length > 0) ?
				workingCopyService.workingCopies.map(workingCopy => `${workingCopy.isDirty() ? '● ' : ''}${workingCopy.resource.toString(true)} (typeId: ${workingCopy.typeId || '<no typeId>'})`) :
				['<none>'],
			``,
			`[Backups]`,
			...(backups.length > 0) ?
				backups.map(backup => `${backup.resource.toString(true)} (typeId: ${backup.typeId || '<no typeId>'})`) :
				['<none>'],
		];

		logService.info(msg.join('\n'));
	}
}

// --- Actions Registration
registerAction2(InspectContextKeysAction);
registerAction2(ToggleScreencastModeAction);
registerAction2(LogStorageAction);
registerAction2(LogWorkingCopiesAction);

// --- Configuration

// Screen Cast Mode
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'screencastMode',
	order: 9,
	title: localize('screencastModeConfigurationTitle', "Screencast Mode"),
	type: 'object',
	properties: {
		'screencastMode.verticalOffset': {
			type: 'number',
			default: 20,
			minimum: 0,
			maximum: 90,
			description: localize('screencastMode.location.verticalPosition', "Controls the vertical offset of the screencast mode overlay from the bottom as a percentage of the workbench height.")
		},
		'screencastMode.fontSize': {
			type: 'number',
			default: 56,
			minimum: 20,
			maximum: 100,
			description: localize('screencastMode.fontSize', "Controls the font size (in pixels) of the screencast mode keyboard.")
		},
		'screencastMode.keyboardShortcutsFormat': {
			enum: ['keys', 'command', 'commandWithGroup', 'commandAndKeys', 'commandWithGroupAndKeys'],
			enumDescriptions: [
				localize('keyboardShortcutsFormat.keys', "Keys."),
				localize('keyboardShortcutsFormat.command', "Command title."),
				localize('keyboardShortcutsFormat.commandWithGroup', "Command title prefixed by its group."),
				localize('keyboardShortcutsFormat.commandAndKeys', "Command title and keys."),
				localize('keyboardShortcutsFormat.commandWithGroupAndKeys', "Command title and keys, with the command prefixed by its group.")
			],
			description: localize('screencastMode.keyboardShortcutsFormat', "Controls what is displayed in the keyboard overlay when showing shortcuts."),
			default: 'commandAndKeys'
		},
		'screencastMode.onlyKeyboardShortcuts': {
			type: 'boolean',
			description: localize('screencastMode.onlyKeyboardShortcuts', "Show only keyboard shortcuts in screencast mode (do not include action names)."),
			default: false
		},
		'screencastMode.hideSingleEditorCursorMoves': {
			type: 'boolean',
			description: localize('screencastMode.hideSingleEditorCursorMoves', "Hide the single editor cursor move commands in screencast mode."),
			default: false
		},
		'screencastMode.keyboardOverlayTimeout': {
			type: 'number',
			default: 800,
			minimum: 500,
			maximum: 5000,
			description: localize('screencastMode.keyboardOverlayTimeout', "Controls how long (in milliseconds) the keyboard overlay is shown in screencast mode.")
		},
		'screencastMode.mouseIndicatorColor': {
			type: 'string',
			format: 'color-hex',
			default: '#FF0000',
			description: localize('screencastMode.mouseIndicatorColor', "Controls the color in hex (#RGB, #RGBA, #RRGGBB or #RRGGBBAA) of the mouse indicator in screencast mode.")
		},
		'screencastMode.mouseIndicatorSize': {
			type: 'number',
			default: 20,
			minimum: 20,
			maximum: 100,
			description: localize('screencastMode.mouseIndicatorSize', "Controls the size (in pixels) of the mouse indicator in screencast mode.")
		},
	}
});
