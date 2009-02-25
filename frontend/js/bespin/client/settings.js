/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
 * See the License for the specific language governing rights and
 * limitations under the License.
 *
 * The Original Code is Bespin.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Bespin Team (bespin@mozilla.com)
 *
 * ***** END LICENSE BLOCK ***** */

dojo.provide("bespin.client.settings");

// = Settings =
//
// This settings module provides a base implementation to store settings for users.
// It also contains various "stores" to save that data, including:
//
// * {{{bespin.client.settings.Core}}} : Core interface to settings. User code always goes through here.
// * {{{bespin.client.settings.Server}}} : The main store. Saves back to the Bespin Server API
// * {{{bespin.client.settings.InMemory}}} : In memory settings that are used primarily for debugging
// * {{{bespin.client.settings.Cookie}}} : Store in a cookie using cookie-jar
// * {{{bespin.client.settings.URL}}} : Intercept settings in the URL. Often used to override
// * {{{bespin.client.settings.DB}}} : Commented out for now, but a way to store settings locally
// * {{{bespin.client.settings.Events}}} : Custom events that the settings store can intercept and send

// ** {{{ bespin.client.settings.Core }}} **
//
// Handles load/save of user settings.
// TODO: tie into the sessions servlet; eliminate Gears dependency

dojo.declare("bespin.client.settings.Core", null, {
    constructor: function() {
        this.browserOverrides = {};
        this.fromURL = new bespin.client.settings.URL();
        this.customEvents = new bespin.client.settings.Events(this);

        this.loadStore();    // Load up the correct settings store
    },

    loadSession: function() {
        var path    = this.fromURL.get('path') || this.get('_path');
        var project = this.fromURL.get('project') || this.get('_project');
        
        dojo.publish("bespin:settings:init", [{ // -- time to init my friends
            path: path,
            project: project
        }]);            
    },

    defaultSettings: function() {
        return {
            'tabsize': '2',
            'fontsize': '10',
            'autocomplete': 'off',
            'collaborate': 'off',
            'syntax': 'auto'
        };
    },

    // TODO: Make sure I can nuke the default function
    initSettings: function() {
        var self = this;

        dojo.publish("bespin:settings:set:collaborate", [{
            value: self.get("collaborate")
        }]);
    },

    isOn: function(value) {
        return value == 'on' || value == 'true';
    },

    isOff: function(value) {
        return value == 'off' || value == 'false';
    },

    // ** {{{ Settings.loadStore() }}} **
    //
    // This is where we choose which store to load
    loadStore: function() {
        this.store = new bespin.client.settings.Server(this);

//        this.store = new Bespin.Settings.Cookie(this);

// TODO: ignore gears for now:
// this.store = (window['google']) ? new Bespin.Settings.DB : new Bespin.Settings.InMemory;
// this.store = new Bespin.Settings.InMemory;
    },

    toList: function() {
        var settings = [];
        var storeSettings = this.store.settings;
        for (var prop in storeSettings) {
            if (storeSettings.hasOwnProperty(prop)) {
                settings.push({ 'key': prop, 'value': storeSettings[prop] });
            }
        }
        return settings;
    },

    set: function(key, value) {
        this.store.set(key, value);

        dojo.publish("bespin:settings:set:" + key, [{ value: value }]);
    },

    get: function(key) {
        var fromURL = this.fromURL.get(key); // short circuit
        if (fromURL) return fromURL;

        return this.store.get(key);
    },

    unset: function(key) {
        this.store.unset(key);
    },

    list: function() {
        if (typeof this.store['list'] == "function") {
            return this.store.list();
        } else {
            return this.toList();
        }
    }

});

// ** {{{ bespin.client.settings.InMemory }}} **
//
// Debugging in memory settings (die when browser is closed)

dojo.declare("bespin.client.settings.InMemory", null, {
    constructor: function(parent) {
        this.parent = parent;

        this.settings = this.parent.defaultSettings();

        dojo.publish("bespin:settings:loaded");
    },

    set: function(key, value) {
        this.settings[key] = value;
    },

    get: function(key) {
        return this.settings[key];
    },

    unset: function(key) {
        delete this.settings[key];
    }
});

// ** {{{ bespin.client.settings.Cookie }}} **
//
// Save the settings in a cookie

dojo.declare("bespin.client.settings.Cookie", null, {
    constructor: function(parent) {
        var expirationInHours = 1;
        this.cookieSettings = {
            expires: expirationInHours / 24,
            path: '/'
        };

        var settings = dojo.fromJson(dojo.cookie("settings"));

        if (settings) {
            this.settings = settings;
        } else {
            this.settings = {
                'tabsize': '2',
                'fontsize': '10',
                'autocomplete': 'off',
                'collaborate': 'off',
                '_username': 'dion'
            };
            dojo.cookie("settings", dojo.toJson(this.settings), this.cookieSettings);
        }
        dojo.publish("bespin:settings:loaded");
    },

    set: function(key, value) {
        this.settings[key] = value;
        dojo.cookie("settings", dojo.toJson(this.settings), this.cookieSettings);
    },

    get: function(key) {
        return this.settings[key];
    },

    unset: function(key) {
        delete this.settings[key];
        dojo.cookie("settings", dojo.toJson(this.settings), this.cookieSettings);
    }
});    

// ** {{{ bespin.client.settings.Server }}} **
//
// The real grand-daddy that implements uses {{{Server}}} to access the backend

dojo.declare("bespin.client.settings.Server", null, {
    constructor: function(parent) {
        this.parent = parent;
        this.server = _server;

        // TODO: seed the settings  
        this.server.listSettings(dojo.hitch(this, function(settings) {
            this.settings = settings;
            if (settings['tabsize'] == undefined) {
                this.settings = this.parent.defaultSettings();
                this.server.setSettings(this.settings);
            }
            dojo.publish("bespin:settings:loaded");
        }));
    },

    set: function(key, value) {
        this.settings[key] = value;
        this.server.setSetting(key, value);
    },

    get: function(key) {
        return this.settings[key];
    },

    unset: function(key) {
        delete this.settings[key];
        this.unsetSetting(key);
    }
});


// ** {{{ bespin.client.settings.DB }}} **
//
// Taken out for now to allow us to not require gears_db.js (and Gears itself).
// Experimental ability to save locally in the SQLite database.
// The plan is to migrate to ActiveRecord.js or something like it to abstract on top
// of various stores (HTML5, Gears, globalStorage, etc.)

/*
// turn off for now so we can take gears_db.js out

Bespin.Settings.DB = Class.create({
    initialize: function(parent) {
        this.parent = parent;
        this.db = new GearsDB('wideboy');

        //this.db.run('drop table settings');
        this.db.run('create table if not exists settings (' +
               'id integer primary key,' +
               'key varchar(255) unique not null,' +
               'value varchar(255) not null,' +
               'timestamp int not null)');

        this.db.run('CREATE INDEX IF NOT EXISTS settings_id_index ON settings (id)');
        dojo.publish("bespin:settings:loaded");
    },

    set: function(key, value) {
        this.db.forceRow('settings', { 'key': key, 'value': value, timestamp: new Date().getTime() }, 'key');
    },

    get: function(key) {
        var rs = this.db.run('select distinct value from settings where key = ?', [ key ]);
        try {
            if (rs && rs.isValidRow()) {
              return rs.field(0);
            }
        } catch (e) {
            console.log(e.message);
        } finally {
            rs.close();
        }
    },

    unset: function(key) {
        this.db.run('delete from settings where key = ?', [ key ]);
    },

    list: function() {
        // TODO: Need to override with browser settings
        return this.db.selectRows('settings', '1=1');
    },

    // -- Private-y
    seed: function() {
        this.db.run('delete from settings');

        // TODO: loop through the settings
        this.db.run('insert into settings (key, value, timestamp) values (?, ?, ?)', ['keybindings', 'emacs', 1183878000000]);
        this.db.run('insert into settings (key, value, timestamp) values (?, ?, ?)', ['tabsize', '2', 1183878000000]);
        this.db.run('insert into settings (key, value, timestamp) values (?, ?, ?)', ['fontsize', '10', 1183878000000]);
        this.db.run('insert into settings (key, value, timestamp) values (?, ?, ?)', ['autocomplete', 'off', 1183878000000]);
    }
});
*/

// ** {{{ bespin.client.settings.URL }}} **
//
// Grab the setting from the URL, either via # or ?   

dojo.declare("bespin.client.settings.URL", null, {
    constructor: function(queryString) {            
        this.results = dojo.queryToObject(this.stripHash(queryString || window.location.hash));
    },

    get: function(key) {
        return this.results[key];
    },

    set: function(key, value) {
        this.results[key] = value;
    },
    
    stripHash: function(url) {
        var tobe = url.split('');
        tobe.shift();
        return tobe.join('');
    }
});

// ** {{{ bespin.client.settings.Events }}} **
//
// Custom Event holder for the Settings work. 
// It deals with both settings themselves, and other events that
// settings need to watch and look for

dojo.declare("bespin.client.settings.Events", null, {
    constructor: function(settings) {
        this.settings = settings;

        // ** {{{ Event: bespin:settings:set }}} **
        // 
        // Watch for someone wanting to do a set operation
        dojo.subscribe("bespin:settings:set", function(event) {
            var key = event.key;
            var value = event.value;

            settings.set(key, value);
        });

        // ** {{{ Event: bespin:editor:openfile:opensuccess }}} **
        // 
        // Change the session settings when a new file is opened
        dojo.subscribe("bespin:editor:openfile:opensuccess", function(event) {
            var file = event.file;

            _editSession.path = file.name;

            settings.set('_project',  _editSession.project);
            settings.set('_path',     _editSession.path);
            settings.set('_username', _editSession.username);

            if (_editSession.syncHelper) _editSession.syncHelper.syncWithServer();
        });

        // ** {{{ Event: bespin:editor:openfile:opensuccess }}} **
        // 
        // Change the syntax highlighter when a new file is opened
        dojo.subscribe("bespin:editor:openfile:opensuccess", function(event) {
            var file = event.file;
            var split = file.name.split('.');
            var type = split[split.length - 1]; 

            if (type)
                dojo.publish("bespin:settings:syntax", [{ language: type }]);
        });

        // ** {{{ Event: bespin:settings:set:syntax }}} **
        // 
        // When the syntax setting is changed, tell the syntax system to change
        dojo.subscribe("bespin:settings:set:syntax", function(event) {
            var value = event.value;
            
            dojo.publish("bespin:settings:syntax", [{ language: value, fromCommand: true }]);
        });

        // ** {{{ Event: bespin:settings:syntax }}} **
        // 
        // Given a new syntax command, change the editor.language        
        dojo.subscribe("bespin:settings:syntax", function(event) {
            var language = event.language;
            var fromCommand = event.fromCommand;
            var syntaxSetting = settings.get('syntax') || "off";      

            if (language == _editor.language) return; // already set to be that language

            if (bespin.util.include(['auto', 'on'], language)) {
                var split = window.location.hash.split('.');
                var type = split[split.length - 1];                
                if (type) _editor.language = type;
            } else if (bespin.util.include(['auto', 'on'], syntaxSetting) || fromCommand) {
                _editor.language = language;
            } else if (syntaxSetting == 'off') {
                _editor.language = 'off';
            } 
        });

        // ** {{{ Event: bespin:settings:set:collaborate }}} **
        // 
        // Turn on the collaboration system if set to be on
        dojo.subscribe("bespin:settings:set:collaborate", function(event) {
            var value = event.value;

            _editSession.collaborate = settings.isOn(value);
        });

        // ** {{{ Event: bespin:settings:set:fontsize }}} **
        // 
        // Change the font size for the editor
        dojo.subscribe("bespin:settings:set:fontsize", function(event) {
            var value = event.value;

            var fontsize = parseInt(value);
            _editor.theme.lineNumberFont = fontsize + "pt Monaco, Lucida Console, monospace";
        });

        // ** {{{ Event: bespin:settings:set:theme }}} **
        // 
        // Change the Theme object used by the editor
        dojo.subscribe("bespin:settings:set:theme", function(event) {
            var theme = event.value;

            if (theme) {
                var themeSettings = bespin.themes[theme];

                if (themeSettings) {
                    if (themeSettings != _editor.theme) {
                          _editor.theme = themeSettings;
                    }
                } else {
                    dojo.publish("bespin:cmdline:showinfo", [{
                        msg: "Sorry old chap. No theme called '" + theme + "'. Fancy making it?"
                    }]);
                }
            }
        });

        // ** {{{ Event: bespin:settings:set:keybindings }}} **
        // 
        // Add in emacs key bindings
        dojo.subscribe("bespin:settings:set:keybindings", function(event) {
            var value = event.value;

            if (value == "emacs") {
                dojo.publish("bespin:editor:bindkey", [{
                    modifiers: "ctrl",
                    key: "b",
                    action: "moveCursorLeft"
                }]);

                dojo.publish("bespin:editor:bindkey", [{
                    modifiers: "ctrl",
                    key: "f",
                    action: "moveCursorRight"
                }]);

                dojo.publish("bespin:editor:bindkey", [{
                    modifiers: "ctrl",
                    key: "p",
                    action: "moveCursorUp"
                }]);

                dojo.publish("bespin:editor:bindkey", [{
                    modifiers: "ctrl",
                    key: "n",
                    action: "moveCursorDown"
                }]);

                dojo.publish("bespin:editor:bindkey", [{
                    modifiers: "ctrl",
                    key: "a",
                    action: "moveToLineStart"
                }]);

                dojo.publish("bespin:editor:bindkey", [{
                    modifiers: "ctrl",
                    key: "e",
                    action: "moveToLineEnd"
                }]);
            }
        });
        
        // ** {{{ Event: bespin:settings:init }}} **
        // 
        // If we are opening up a new file
        dojo.subscribe("bespin:settings:init", function(event) {
            var path    = event.path;
            var project = event.project;

            // TODO: use the action and don't run a command itself
            var newfile = settings.fromURL.get('new');
            if (!newfile) { // scratch file
                if (project && (_editSession.project != project)) {
                    dojo.publish("bespin:editor:project:set", [{ project: project }]);
                }

                if (path) {
                    dojo.publish("bespin:editor:openfile", [{ filename: path }]);
                }
            }
        });

        // ** {{{ Event: bespin:settings:init }}} **
        // 
        // Setup the theme
        dojo.subscribe("bespin:settings:init", function(event) {
            dojo.publish("bespin:settings:set:theme", [{
                value: settings.get('theme')
            }]);
        });

        // ** {{{ Event: bespin:settings:init }}} **
        // 
        // Setup the special keybindings
        dojo.subscribe("bespin:settings:init", function(event) {
            dojo.publish("bespin:settings:set:keybindings", [{
                value: settings.get('keybindings')
            }]);
        });

        // ** {{{ Event: bespin:settings:init }}} **
        // 
        // Check for auto load
        dojo.subscribe("bespin:settings:init", function(event) {
            if (settings.isOn(settings.get('autoconfig'))) {
                dojo.publish("bespin:editor:config:run");
            }
        });

        // ** {{{ Event: bespin:settings:init }}} **
        // 
        // Setup the font size that the user has configured
        dojo.subscribe("bespin:settings:init", function(event) {
            var fontsize = settings.get('fontsize');
            dojo.publish("bespin:settings:set:fontsize", [{
                value: fontsize
            }]);
        });        
    }
});