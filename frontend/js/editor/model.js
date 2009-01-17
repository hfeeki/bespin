/*
 * Represents the document being edited.
 */
var DocumentModel = Class.create({
    initialize: function() {
        this.rows = [];
    },

    getDirtyRows: function() {
        var dr = (this.dirtyRows) ? this.dirtyRows : [];
        this.dirtyRows = null;
        return dr;
    },

    setRowDirty: function(row) {
        if (!this.dirtyRows) this.dirtyRows = new Array(this.rows.length);
        this.dirtyRows[row] = true;
    },

    setRowArray: function(rowIndex, row) {
        if (!Object.isArray(row)) {
            row = row.split('');
        }
        this.rows[rowIndex] = row;
    },

    // gets the row array for the specified row, creating it and any intermediate rows as necessary
    getRowArray: function(rowIndex) {
        while (this.rows.length <= rowIndex) this.rows.push([]);
        return this.rows[rowIndex];
    },

    // gets the number of characters in the passed row
    getRowLength: function(rowIndex) {
        return this.getRowArray(rowIndex).length;
    },

    // checks if there is a row at the specified index; useful because getRowArray() creates rows as necessary
    hasRow: function(rowIndex) {
        return (this.rows[rowIndex]);
    },

    // will insert blank spaces if passed col is past the end of passed row
    insertCharacters: function(pos, string) {
        var row = this.getRowArray(pos.row);
        while (row.length < pos.col) row.push(" ");

        var newrow = (pos.col > 0) ? row.splice(0, pos.col) : [];
        newrow = newrow.concat(string.split(""));
        this.rows[pos.row] = newrow.concat(row);

        this.setRowDirty(pos.row);
    },

    getDocument: function() {
        var file = [];
        for (var x = 0; x < this.getRowCount(); x++) {
            file[x] = this.getRowArray(x).join('');
        }
        return file.join("\n");
    },

    insertDocument: function(content) {
        this.clear();
        var rows = content.split("\n");
        for (var x = 0; x < rows.length; x++) {
            this.insertCharacters({ row: x, col: 0 }, rows[x]);
        }
    },

    changeEachRow: function(changeFunction) {
        for (var x = 0; x < this.getRowCount(); x++) {
            var row = this.getRowArray(x);
            row = changeFunction(row);
            this.setRowArray(x, row);
        }
    },

    replace: function(search, replace) {
      for (var x = 0; x < this.getRowCount(); x++) {
        var line = this.getRowArray(x).join('');

        if (line.match(search)) {
          var regex = new RegExp(search, "g");
          var newline = line.replace(regex, replace);
          if (newline != line) {
            this.rows[x] = newline.split('');
          }
        }
      }
    },

    // will silently adjust the length argument if invalid
    deleteCharacters: function(pos, length) {
        var row = this.getRowArray(pos.row);
        var diff = (pos.col + length - 1) - row.length;
        if (diff > 0) length -= diff;
        if (length > 0) {
            this.setRowDirty(pos.row);
            return row.splice(pos.col, length).join("");
        }
        return "";
    },

    clear: function() {
        this.rows = [];
    },

    deleteRows: function(row, count) {
        var diff = (row + count - 1) - this.rows.length;
        if (diff > 0) count -= diff;
        if (count > 0) this.rows.splice(row, count);
    },

    // splits the passed row at the col specified, putting the right-half on a new line beneath the pased row
    splitRow: function(pos) {
        var row = this.getRowArray(pos.row);

        var newRow;
        if (pos.col < row.length) {
            newRow = row.splice(pos.col);
        } else {
            newRow = [];
        }

        if (pos.row == (this.rows.length - 1)) {
            this.rows.push(newRow);
        } else {
            var newRows = this.rows.splice(0, pos.row + 1);
            newRows.push(newRow);
            newRows = newRows.concat(this.rows);
            this.rows = newRows;
        }
    },

    // joins the passed row with the row beneath it
    joinRow: function(rowIndex) {
        if (row >= this.rows.length - 1) return;
        var row = this.getRowArray(rowIndex);
        this.rows[rowIndex] = row.concat(this.rows[rowIndex + 1]);
        this.rows.splice(rowIndex + 1, 1);
    },

    // returns the maximum number of columns across all rows
    getMaxCols: function() {
        var cols = 0;
        for (var i = 0; i < this.rows.length; i++) cols = Math.max(cols, this.rows[i].length);
        return cols;
    },

    // returns the number of rows in the model
    getRowCount: function() {
        return this.rows.length;
    },

    // returns a "chunk": a string representing a part of the document with \n characters representing end of line
    getChunk: function(selection) {
        var startPos = selection.startPos;
        var endPos = selection.endPos;

        var startCol, endCol;
        var chunk = "";

        // get the first line
        startCol = startPos.col;
        var row = this.getRowArray(startPos.row);
        endCol = (endPos.row == startPos.row) ? endPos.col : row.length;
        if (endCol > row.length) endCol = row.length;
        chunk += row.join("").substring(startCol, endCol);

        // get middle lines, if any
        for (var i = startPos.row + 1; i < endPos.row; i++) {
            chunk += "\n";
            chunk += this.getRowArray(i).join("");
        }

        // get the end line
        if (startPos.row != endPos.row) {
            startCol = 0;
            endCol = endPos.col;
            row = this.getRowArray(endPos.row);
            if (endCol > row.length) endCol = row.length;
            chunk += "\n" + row.join("").substring(startCol, endCol);
        }

        return chunk;
    },

    // deletes the text between the startPos and endPos, joining as necessary. startPos and endPos are inclusive
    deleteChunk: function(selection) {
        var chunk = this.getChunk(selection);

        var startPos = selection.startPos;
        var endPos = selection.endPos;

        var startCol, endCol;

        // get the first line
        startCol = startPos.col;
        var row = this.getRowArray(startPos.row);
        endCol = (endPos.row == startPos.row) ? endPos.col : row.length;
        if (endCol > row.length) endCol = row.length;
        this.deleteCharacters({ row: startPos.row, col: startCol}, endCol - startCol);

        // get the end line
        if (startPos.row != endPos.row) {
            startCol = 0;
            endCol = endPos.col;
            row = this.getRowArray(endPos.row);
            if (endCol > row.length) endCol = row.length;
            this.deleteCharacters({ row: endPos.row, col: startCol}, endCol - startCol);
        }

        // remove any lines in-between
        if ((endPos.row - startPos.row) > 1) this.deleteRows(startPos.row + 1, endPos.row - startPos.row - 1);

        // join the rows
        if (endPos.row != startPos.row) this.joinRow(startPos.row);

        return chunk;
    },

    // inserts the chunk and returns the ending position
    insertChunk: function(pos, chunk) {
        var lines = chunk.split("\n");
        var cpos = EditorUtils.copyPos(pos);
        for (var i = 0; i < lines.length; i++) {
            this.insertCharacters(cpos, lines[i]);
            cpos.col = cpos.col + lines[i].length;

            if (i < lines.length - 1) {
                this.splitRow(cpos);
                cpos.col = 0;
                cpos.row = cpos.row + 1;
            }
        }
        return cpos;
    }
});