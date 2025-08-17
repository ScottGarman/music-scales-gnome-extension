// extension.js - Main extension file
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ROOT_NOTES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

// Musical scale definitions
const SCALES = {
    Major: [0, 2, 4, 5, 7, 9, 11],
    'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    Dorian: [0, 2, 3, 5, 7, 9, 10],
    Phrygian: [0, 1, 3, 5, 7, 8, 10],
    Lydian: [0, 2, 4, 6, 7, 9, 11],
    Mixolydian: [0, 2, 4, 5, 7, 9, 10],
    Locrian: [0, 1, 3, 5, 6, 8, 10],
    'Pentatonic Major': [0, 2, 4, 7, 9],
    'Pentatonic Minor': [0, 3, 5, 7, 10],
    Blues: [0, 3, 5, 6, 7, 10],
    Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const MusicScaleHelper = GObject.registerClass(
    class MusicScaleHelper extends PanelMenu.Button {
        _init(extensionObject) {
            super._init(0.0, _('Music Scale Helper'));

            this._extensionObject = extensionObject;

            // Use the piano keyboard emoji as our icon
            this._icon = new St.Label({
                text: '🎹',
                style_class: 'system-status-icon',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._icon);

            // Load saved settings or use defaults
            this._loadSettings();

            this._createMenu();
        }

        // We load/save the current settings to preserve the state of the applet when
        // doing things that reload applets, such as suspend/resume on a laptop.
        _loadSettings() {
            try {
                const settingsFile = Gio.File.new_for_path(this._extensionObject.path + '/settings.json');

                if (settingsFile.query_exists(null)) {
                    const [success, contents] = settingsFile.load_contents(null);
                    if (success) {
                        const settings = JSON.parse(new TextDecoder().decode(contents));
                        this._currentRoot = settings.root || 0;
                        this._currentScale = settings.scale || 'Major';
                        return;
                    }
                }
            } catch (e) {
                // If loading fails, use defaults
                console.log('Music Scale Helper: Could not load settings, using defaults');
            }

            // Defaults to C Major
            this._currentRoot = 0; // C
            this._currentScale = 'Major';
        }

        // Save settings to 'settings.json' in the extension directory
        _saveSettings() {
            try {
                const settings = {
                    root: this._currentRoot,
                    scale: this._currentScale,
                };

                const settingsFile = Gio.File.new_for_path(this._extensionObject.path + '/settings.json');

                const settingsData = JSON.stringify(settings, null, 2);
                settingsFile.replace_contents(
                    new TextEncoder().encode(settingsData),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null
                );
            } catch (e) {
                console.log('Music Scale Helper: Could not save settings');
            }
        }

        _createMenu() {
            // Root note selector
            this._rootMenuItem = new PopupMenu.PopupSubMenuMenuItem(`Root Note: ${ROOT_NOTES[this._currentRoot]}`);
            this.menu.addMenuItem(this._rootMenuItem);

            ROOT_NOTES.forEach((note, index) => {
                const item = new PopupMenu.PopupMenuItem(note, {
                    activate: false, // Disable default activation behavior
                    hover: true, // Keep hover effects
                });

                // We want to keep the applet open after the user changes menu settings,
                // so add a custom click handler that doesn't close the applet window.
                item.connect('button-press-event', (actor, event) => {
                    if (event.get_button() === 1) {
                        // Left click
                        this._onRootChanged(index, note);
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                });

                this._rootMenuItem.menu.addMenuItem(item);
            });

            // Scale type selector
            this._scaleMenuItem = new PopupMenu.PopupSubMenuMenuItem(`Scale: ${this._currentScale}`);
            this.menu.addMenuItem(this._scaleMenuItem);

            Object.keys(SCALES).forEach((scale) => {
                const item = new PopupMenu.PopupMenuItem(scale, {
                    activate: false, // Disable default activation behavior
                    hover: true, // Keep hover effects
                });

                // We want to keep the applet open after the user changes menu settings,
                // so add a custom click handler that doesn't close the applet window.
                item.connect('button-press-event', (actor, event) => {
                    if (event.get_button() === 1) {
                        // Left click
                        this._onScaleChanged(scale);
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                });

                this._scaleMenuItem.menu.addMenuItem(item);
            });

            // Separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Piano keyboard display
            this._createKeyboard();

            // Update initial display
            this._updateKeyboard();
        }

        _createKeyboard() {
            // Main keyboard container
            this._keyboardContainer = new St.BoxLayout({
                vertical: false,
                style_class: 'music-keyboard-container',
                style: 'padding: 10px; background-color: #f0f0f0; border-radius: 8px;',
            });

            // Create piano keys for one octave
            this._keys = [];
            const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
            const blackKeys = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
            const whiteKeyNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            const blackKeyNames = ['C#', 'D#', 'F#', 'G#', 'A#'];

            // Container for relative positioning of keys
            const keyboardLayout = new St.Widget({
                layout_manager: new Clutter.FixedLayout(),
                width: 280,
                height: 80,
            });

            // Create white keys first
            whiteKeys.forEach((semitone, index) => {
                const key = new St.Button({
                    style: 'background-color: white; border: 1px solid #ccc; border-radius: 0px 0px 4px 4px;',
                    width: 38,
                    height: 80,
                    x: index * 38,
                    y: 0,
                });

                // Add key label
                const label = new St.Label({
                    text: whiteKeyNames[index],
                    style: 'color: #666; font-size: 10px;',
                    y_align: Clutter.ActorAlign.END,
                    y_expand: false,
                });
                key.set_child(label);

                key._semitone = semitone;
                key._isBlack = false;
                this._keys.push(key);
                keyboardLayout.add_child(key);
            });

            // Create black keys
            const blackKeyPositions = [26, 64, 140, 178, 216]; // Positions between white keys
            blackKeys.forEach((semitone, index) => {
                const key = new St.Button({
                    style: 'background-color: #333; border: 1px solid #000; border-radius: 0px 0px 2px 2px;',
                    width: 24,
                    height: 50,
                    x: blackKeyPositions[index],
                    y: 0,
                });

                // Add key label
                const label = new St.Label({
                    text: blackKeyNames[index],
                    style: 'color: white; font-size: 8px;',
                    y_align: Clutter.ActorAlign.END,
                    y_expand: false,
                });
                key.set_child(label);

                key._semitone = semitone;
                key._isBlack = true;
                this._keys.push(key);
                keyboardLayout.add_child(key);
            });

            this._keyboardContainer.add_child(keyboardLayout);

            // Add keyboard to menu
            const keyboardMenuItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            keyboardMenuItem.add_child(this._keyboardContainer);
            this.menu.addMenuItem(keyboardMenuItem);
        }

        _onRootChanged(index, note) {
            this._currentRoot = index;
            this._rootMenuItem.label.text = `Root Note: ${note}`;
            this._updateKeyboard();
            this._saveSettings();
        }

        _onScaleChanged(scale) {
            this._currentScale = scale;
            this._scaleMenuItem.label.text = `Scale: ${scale}`;
            this._updateKeyboard();
            this._saveSettings();
        }

        _updateKeyboard() {
            const scaleNotes = SCALES[this._currentScale];

            this._keys.forEach((key) => {
                const adjustedSemitone = (key._semitone - this._currentRoot + 12) % 12;
                const isInScale = scaleNotes.includes(adjustedSemitone);

                if (isInScale) {
                    if (key._isBlack) {
                        key.style =
                            'background-color: #4169E1; border: 2px solid #0000CD; border-radius: 0px 0px 2px 2px;';
                    } else {
                        key.style =
                            'background-color: #ADD8E6; border: 2px solid #4169E1; border-radius: 0px 0px 4px 4px;';
                    }
                } else {
                    if (key._isBlack) {
                        key.style = 'background-color: #333; border: 1px solid #000; border-radius: 0px 0px 2px 2px;';
                    } else {
                        key.style = 'background-color: white; border: 1px solid #ccc; border-radius: 0px 0px 4px 4px;';
                    }
                }
            });
        }
    }
);

export default class MusicScaleHelperExtension extends Extension {
    enable() {
        this._indicator = new MusicScaleHelper(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
