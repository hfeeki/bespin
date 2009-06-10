
th.BespinProjectPanel = Class.define({
    type: "BespinProjectPanel",

    superclass: th.Panel,

    member: {
        init: function(parms) {
            if (!parms) parms = {};
            this._super(parms);

            this.projectLabel = new th.Label({ text: "Projects", className: "projectLabel" });

            this.list = new th.List();

            this.splitter = new th.Splitter({ orientation: th.HORIZONTAL });

            this.footer = new th.BespinProjectPanelFooter();

            this.add([ this.projectLabel, this.list, this.splitter, this.footer ]);

            this.bus.bind("dragstart", this.splitter, this.ondragstart, this);
            this.bus.bind("drag", this.splitter, this.ondrag, this);
            this.bus.bind("dragstop", this.splitter, this.ondragstop, this);

            // this is a closed container
            delete this.add;
            delete this.remove;
        },

        ondragstart: function(e) {
            this.startWidth = this.bounds.width;
        },

        ondrag: function(e) {
            var delta = e.currentPos.x - e.startPos.x;
            this.prefWidth = this.startWidth + delta;
            this.getScene().render();
        },

        ondragstop: function(e) {
            delete this.startWidth;
        },

        getPreferredSize: function() {
            return { width: this.prefWidth || 150, height: 0 };
        },

        layout: function() {
            var d = this.d();

            var y = d.i.t;

            // todo: when I have a better way to do uni-dimensional preferred sizing, restore this
            //var lh = this.projectLabel.getPreferredHeight(d.b.w);
            var lh = this.projectLabel.getPreferredSize().height;

            this.projectLabel.bounds = { y: y, x: d.i.l, height: lh, width: d.b.w };
            y += lh;

            var sw = this.splitter.getPreferredSize().width;
            this.splitter.bounds = { x: d.b.w - d.i.r - sw, height: d.b.h - d.i.b - y, y: y, width: sw };

            var innerWidth = d.b.w - d.i.w - sw;

            // todo: when I have a better way to do uni-dimensional preferred sizing, restore this
//            var ph = this.footer.getPreferredHeight(innerWidth);
            var ph = this.footer.getPreferredSize().height;

            this.footer.bounds = { x: d.i.l, y: d.b.h - ph, width: innerWidth, height: ph };

            this.list.bounds = { x: d.i.l, y: y, width: innerWidth, height: this.splitter.bounds.height };
        }
    }
});

var heightDiff;
var projects;
var scene;
var tree;
var infoPanel;
var currentProject;
//    var go = bespin.util.navigate; // short cut static method
//    var bd = bespin.page.dashboard;
var bd = this;

var server;
var settings;
var editSession;
var files;
var commandLine;

dojo.mixin(this, {
    tree: null,
    lastSelectedPath: null,
    urlTimeout: null,
    isLoggedIn: false,

    sizeCanvas: function(canvas) {
        if (!heightDiff) {
            heightDiff = dojo.byId("header").clientHeight + dojo.byId("subheader").clientHeight + dojo.byId("footer").clientHeight;
        }
        var height = window.innerHeight - heightDiff + 11;
        dojo.attr(canvas, { width: window.innerWidth, height: height });
    },

    loggedIn: function(userinfo)  {
        // in some cases the user gets logged in twice => causes problems with restorePath()...
        if (bd.isLoggedIn) return;

        bd.isLoggedIn = true;
        editSession.setUserinfo(userinfo);

        bespin.publish("authenticated");

        server.list(null, null, bd.displayProjects); // get projects
        server.listOpen(bd.displaySessions); // get sessions
    },

    notLoggedIn: function(xhr) {
        //go.home();
        console.log("implement go.home");
    },

    prepareFilesForTree: function(files) {
        if (files.length == 0) return [];

        var name;
        var fdata = [];
        var settings = bespin.get('settings');
        for (var i = 0; i < files.length; i++) {
            name = files[i].name;
            if (settings && settings.isSettingOff('dotmode') && name[0] == '.') {
                continue;
            }
            if (/\/$/.test(name)) {
                name = name.substring(0, name.length - 1);
                fdata.push({ name: name, contents: bd.fetchFiles });
            } else {
                fdata.push({ name: name });
            }
        }

        return fdata;
    },

    getFilePath: function(treePath) {
        var filepath = "";

        for (var i = 0; i < treePath.length; i++) {
            if (treePath[i] && treePath[i].name) {
                filepath += treePath[i].name + ((i < treePath.length - 1) ? "/" : "");
            }
        }
        return filepath;
    },

    fetchFiles: function(path, tree) {
        var filepath = bd.getFilePath(path);

        server.list(filepath, null, function(files) {
            tree.updateData(path[path.length - 1], bd.prepareFilesForTree(files));
            tree.render();
        });
    },

    restorePath: function(newPath) {
        bd.lastSelectedPath = bd.lastSelectedPath || '';
        newPath = newPath || '';
        var oldPath = bd.lastSelectedPath;
        bd.lastSelectedPath = newPath;

        if (newPath == oldPath && newPath != '') return;     // the path has not changed

        newPath = newPath.split('/');
        oldPath = oldPath.split('/');
        currentProject = newPath[0];

        tree.lists[0].selectItemByText(newPath[0]);    // this also perform a rendering of the project.list
        scene.renderAllowed = false;

        var sameLevel = 1;  // the value is 1 and not 0, as the first list (the project list) is not affected!
        while (sameLevel < Math.min(newPath.length, oldPath.length) && newPath[sameLevel] == oldPath[sameLevel] && newPath[sameLevel] != '') {
            sameLevel ++;
        }

        var fakePath = new Array(newPath.length);
        for (var x = 1; x < newPath.length; x++) {
            var fakeItem = new Object();
            fakeItem.name = newPath[x];
            if (x != newPath.length - 1) {
                fakeItem.contents = 'fake';
            }
            if (x > bd.tree.lists.length - 1) {
               bd.tree.showChildren(null, new Array(fakeItem));
            }
            if (newPath[x] != '') {
                bd.tree.lists[x].selectItemByText(newPath[x]);
            }
            fakePath[x] = fakeItem;
        }

        if (newPath.length <= bd.tree.lists.length) {
            bd.tree.removeListsFrom(newPath.length);
        }

        var contentsPath = new Array(newPath.length);
        var countSetupPaths = sameLevel;

        // this function should stay here, as this funciton is accessing "pathContents" and "countSetupPaths"
        var displayFetchedFiles = function(files) {
            // "this" is the callbackData object!
            var contents = bd.prepareFilesForTree(files);
            if (this.index != 0) {
                contentsPath[this.index] = contents;
            }

            bd.tree.replaceList(this.index, contents);
            bd.tree.lists[this.index].selectItemByText(fakePath[this.index].name);
            countSetupPaths ++;

            if (countSetupPaths == newPath.length) {
                for (var x = 0; x < newPath.length - 1; x++) {
                    // when the path is not restored from the root, then there are contents without contents!
                    if (contentsPath[x + 1]) {
                        // todo: I added the if () to fix an error, not sure if it was a symptom of something larger
                        if (bd.tree.lists[x].selected) bd.tree.lists[x].selected.contents = contentsPath[x + 1];
                    }
                }
            }
        };

        // get the data for the lists
        for (var x = sameLevel; x < newPath.length; x++) {
            var selected = bd.tree.lists[x - 1].selected;
            if (selected && selected.contents && dojo.isArray(selected.contents)) {
                // restore filelist from local memory (the filelists was ones fetched)
                if (x > bd.tree.lists.length - 1) {
                    bd.tree.showChildren(null, selected.contents);
                } else {
                    bd.tree.replaceList(x, selected.contents);
                }
                bd.tree.lists[x].selectItemByText(fakePath[x].name);
                countSetupPaths ++;
            } else {
                // load filelist form server
                var filepath = currentProject + "/" + bd.getFilePath(fakePath.slice(1, x));
                server.list(filepath, null, dojo.hitch({index: x}, displayFetchedFiles));
            }
        }

        // deselect lists if needed
        for (var x = newPath.length; x < tree.lists.length; x++) {
            delete tree.lists[x].selected;
        }

        scene.renderAllowed = true;
        scene.render();
    },

    displayProjects: function(projectItems) {
        for (var i = 0; i < projectItems.length; i++) {
            projectItems[i] = { name: projectItems[i].name.substring(0, projectItems[i].name.length - 1) , contents: bd.fetchFiles};
        }

        tree.replaceList(0, projectItems);

        // Restore the last selected file
        var path =  (new bespin.client.settings.URL()).get('path');
        if (!bd.lastSelectedPath) {
            bd.restorePath(path);
        } else {
            scene.render();
        }
    },

    refreshProjects: function() {
        server.list(null, null, bd.displayProjects);
    }
});

function onLoad() {
    scene = new th.Scene(dojo.byId("canvas"));

    tree = new th.HorizontalTree({ id: "htree" });

    bd.tree = tree;

    // invoking showChildren() here causes the List containing the children to be created, which is necessary
    // for us to manipulate it a touch here
    bd.tree.showChildren(null, [{name: ''}]);

    // set various properties of this first list, which contains the projects to display
    tree.lists[0].addTopLabel(new th.Label({ text: "Projects" }));
    tree.lists[0].allowDeselection = false;

    var topPanel = new th.Panel();
    topPanel.add([ tree ]);
    topPanel.layout = function() {
        var d = this.d();
        tree.bounds = { x: d.i.l, y: d.i.t, width: d.b.w - d.i.w, height: d.b.h - d.i.h };
    };

    scene.root.add(topPanel);

    scene.render();

    scene.bus.bind("dblclick", tree, function(e) {
        var newTab = e.shiftKey;
        var path = tree.getSelectedPath();
        if (path.length == 0 || path[path.length - 1].contents) return; // don't allow directories either
        //go.editor(currentProject, bd.getFilePath(path.slice(1, path.length)), newTab);
        console.log("implement go.editor");
    });

    scene.bus.bind("itemselected", tree, function(e) {
        var pathSelected = tree.getSelectedPath(true);
        //var db = bespin.page.dashboard;
        var db = this;
        // this keeps the url to be changed if the file path changes to frequently
        if (db.urlTimeout) {
            clearTimeout(db.urlTimeout);
        }
        db.urlTimeout = setTimeout(dojo.hitch(pathSelected, function () {
            db.lastSelectedPath = this;
            location.hash = '#path=' + this;
        }), 300);
    }, this);

    scene.bus.bind("itemselected", tree.lists[0], function(e) {
        currentProject = e.item.name;
        bespin.publish("project:set", { project: currentProject, suppressPopup: true, fromDashboardItemSelected: true });
    });

    // setup the command line
    server = bespin.register('server', new bespin.client.Server());
    settings = bespin.register('settings', new bespin.client.settings.Core());
    editSession = bespin.register('editSession', new bespin.client.session.EditSession());
    files = bespin.register('files', new bespin.client.FileSystem());

    // get logged in name; if not logged in, display an error of some kind
    server.currentuser(bd.loggedIn, bd.notLoggedIn);

    // provide history for the dashboard
    bespin.subscribe("url:changed", function(e) {
        var pathSelected =  (new bespin.client.settings.URL()).get('path');
        bespin.page.dashboard.restorePath(pathSelected);
    });

    // TODO: commenting this out as it is throwing errors at the moment
    // provide arrow navigation to dashboard
    dojo.connect(window, "keydown", dojo.hitch(tree, function(e) {
        var key = bespin.util.keys.Key;
        var path = this.getSelectedPath();
        if (path === undefined) return;
        // things to make life much more easy :)
        var index = path.length - 1;
        var list = this.lists[index];
        var listNext = (this.lists.length > index ? this.lists[index + 1] : false);
        var listPre = (index != 0 ? this.lists[index - 1] : false);

        switch (e.keyCode) {
            case key.LEFT_ARROW:
                if (!listPre) break;
                // listPre.selected.lastSelected = list.selected.name;  // save the selection, if the user comes back to this list
                listPre.bus.fire("itemselected", { container: listPre, item: list.selected }, listPre);
                break;
            case key.RIGHT_ARROW:
                if (!listNext) break;
                if (list.selected.lastSelected) {
                    listNext.selectItemByText(list.selected.lastSelected);
                    listNext.bus.fire("itemselected", { container: listNext, item: list.selected }, listNext);
                } else {
                    listNext.selected = listNext.items[0];
                    listNext.bus.fire("itemselected", { container: listNext, item: list.selected }, listNext);
                }
                break;
            case key.UP_ARROW:
                list.moveSelectionUp();
                break;
            case key.DOWN_ARROW:
                list.moveSelectionDown();
                break;
            case key.ENTER:
                this.bus.fire("dblclick", e, tree);
                break;
        }
    }));
}