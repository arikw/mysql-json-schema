'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _mysql = require('mysql');

var _mysql2 = _interopRequireDefault(_mysql);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var GetSchema = function GetSchema(connection) {
    var schema = { type: 'mysql', tables: {} };

    return new Promise(function (resolve, reject) {
        GetTableList(connection, connection.config.database).then(function (tableNames) {
            var promises = [];
            tableNames.forEach(function (tableName, index, array) {
                promises.push(GetFieldsFromTable(connection, tableName).then(function (fields) {
                    fields.forEach(function (field, index, array) {
                        if (!schema.tables[tableName]) {
                            schema.tables[tableName] = { fields: [], relationsFromTable: [], relationsToTable: [] };
                        }
                        schema.tables[tableName].fields.push(field);
                    });
                }));
            });
            Promise.all(promises).then(function () {
                return resolve(schema);
            });
        }).catch(function (err) {
            return reject(err);
        });
    });
};

var GetTableList = function GetTableList(connection) {
    var tables = [];
    var sqlTables = ' SELECT * FROM information_schema.tables where table_schema = \'' + connection.config.database + '\' ';
    return connection.query(sqlTables).then(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 1),
            respTables = _ref2[0];

        respTables.forEach(function (value, index, array) {
            tables.push(value.TABLE_NAME);
        });
        return tables;
    });
};

var GetFieldsFromTable = function GetFieldsFromTable(connection, table) {
    var fields = [];
    return connection.query('desc ' + table).then(function (_ref3) {
        var _ref4 = _slicedToArray(_ref3, 1),
            rows = _ref4[0];

        rows.forEach(function (value, index, array) {
            var Field = value.Field,
                Type = value.Type,
                Null = value.Null,
                Key = value.Key,
                Default = value.Default,
                Extra = value.Extra; // Extract info

            fields.push({ Field: Field, Type: Type, Null: Null === 'YES', Key: Key, Default: Default, Extra: Extra });
        });
        return fields;
    });
};

var CreateConnection = function CreateConnection() {
    var args = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var user = args.user,
        password = args.password,
        host = args.host,
        database = args.database,
        _args$multipleStateme = args.multipleStatements,
        multipleStatements = _args$multipleStateme === undefined ? true : _args$multipleStateme;

    var connection = _mysql2.default.createConnection({ user: user, password: password, host: host, database: database, multipleStatements: multipleStatements });
    return connection;
};

var CreateConnectionAsync = function CreateConnectionAsync() {
    var args = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    var connection = CreateConnection(args);
    return connection.connect();
};

var AddRelationsToSchema = function AddRelationsToSchema(connection, schema) {
    return new Promise(function (resolve, reject) {

        var promises = [];
        var tableNames = Object.keys(schema.tables);
        tableNames.forEach(function (tableName, index, array) {
            promises.push(GetRelationsFromTable(connection, tableName).then(function (relationsFromTable) {
                if (!schema.tables[tableName]) {
                    schema.tables[tableName] = { fields: [], relationsFromTable: [], relationsToTable: [] };
                }

                schema.tables[tableName].relationsFromTable = schema.tables[tableName].relationsFromTable.concat(relationsFromTable);
                relationsFromTable.forEach(function (relation) {
                    var fieldFKIndex = _lodash2.default.findIndex(schema.tables[tableName].fields, function (f) {
                        return f.Field === relation.localField;
                    });
                    if (fieldFKIndex >= 0) {
                        schema.tables[tableName].fields[fieldFKIndex].isForeignKey = true;
                    }
                });

                return GetRelationsToTable(connection, tableName).then(function (relationsToTable) {
                    schema.tables[tableName].relationsToTable = schema.tables[tableName].relationsToTable.concat(relationsToTable);
                });
            }));
        });
        Promise.all(promises).then(function () {
            return resolve(schema);
        }).catch(function (err) {
            return reject(err);
        });
    });
};

var AddRelationsByFieldNameToSchema = function AddRelationsByFieldNameToSchema(schema) {
    var aliases = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    var ignoreDefaultNames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    var prefix = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'id_';
    var sufix = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '_id';

    var tableNames = Object.keys(schema.tables);
    tableNames.forEach(function (tableName, index, array) {
        var aliasesFromThisTable = _lodash2.default.filter(aliases, function (a) {
            return a.localTable === tableName;
        });
        var aliasesToThisTable = _lodash2.default.filter(aliases, function (a) {
            return a.foreignTable === tableName;
        });
        GetRelationsFromTableByFieldNames(tableName, schema, aliasesFromThisTable, ignoreDefaultNames, prefix, sufix);
        GetRelationsToTableByFieldNames(tableName, schema, aliasesToThisTable, ignoreDefaultNames, prefix, sufix);
    });
    return schema;
};

var GetRelationsFromTable = function GetRelationsFromTable(connection, table) {
    var sqlRelaciones = ' SELECT  TABLE_SCHEMA as db, \n     TABLE_NAME as t1,\n     COLUMN_NAME as t1Field,\n      REFERENCED_TABLE_SCHEMA as db2,\n      REFERENCED_TABLE_NAME as t2,\n      REFERENCED_COLUMN_NAME as t2Field \n    FROM \n      INFORMATION_SCHEMA.KEY_COLUMN_USAGE \n    WHERE \n      TABLE_SCHEMA = SCHEMA()\n      AND REFERENCED_TABLE_NAME IS NOT NULL \n     and (TABLE_NAME = \'' + table + '\');'; // and (REFERENCED_TABLE_NAME = '${table}');`

    var relations = [];
    return connection.query(sqlRelaciones).then(function (_ref5) {
        var _ref6 = _slicedToArray(_ref5, 1),
            relationsResp = _ref6[0];

        relationsResp.forEach(function (value, index, array) {
            var db = value.db,
                t1 = value.t1,
                t1Field = value.t1Field,
                db2 = value.db2,
                t2 = value.t2,
                t2Field = value.t2Field; // Extract info

            relations.push({ localField: t1Field, foreignTable: t2, foreignField: t2Field });
        });
        return relations;
    });
};

var GetRelationsToTable = function GetRelationsToTable(connection, table) {
    var sqlRelaciones = ' SELECT  TABLE_SCHEMA as db, \n     TABLE_NAME as t1,\n     COLUMN_NAME as t1Field,\n      REFERENCED_TABLE_SCHEMA as db2,\n      REFERENCED_TABLE_NAME as t2,\n      REFERENCED_COLUMN_NAME as t2Field \n    FROM \n      INFORMATION_SCHEMA.KEY_COLUMN_USAGE \n    WHERE \n      TABLE_SCHEMA = SCHEMA()\n      AND REFERENCED_TABLE_NAME IS NOT NULL \n     and (REFERENCED_TABLE_NAME = \'' + table + '\');';

    var relations = [];
    return connection.query(sqlRelaciones).then(function (_ref7) {
        var _ref8 = _slicedToArray(_ref7, 1),
            relationsResp = _ref8[0];

        relationsResp.forEach(function (value, index, array) {
            var db = value.db,
                t1 = value.t1,
                t1Field = value.t1Field,
                db2 = value.db2,
                t2 = value.t2,
                t2Field = value.t2Field; // Extract info

            relations.push({ localField: t2Field, foreignTable: t1, foreignField: t1Field });
        });
        return relations;
    });
};

var CreateFileWithContent = function CreateFileWithContent(fileName, content, outputFolder) {
    var logger = _fs2.default.createWriteStream(outputFolder + '/' + fileName + '.json', {
        flags: 'w' // 'a' means appending (old data will be preserved)
    });
    logger.write(JSON.stringify(content, null, 4));
    logger.end();
};

var GetSchemaWithRelations = function GetSchemaWithRelations(connection) {
    return GetSchema(connection).then(function (res) {
        return AddRelationsToSchema(connection, res);
    }).catch(function (err) {
        console.error(err);
        throw err;
    });
};

var GetSchemaWithRelationsByFieldNames = function GetSchemaWithRelationsByFieldNames(connection) {
    var aliases = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    var ignoreDefaultNames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    var prefix = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'id_';
    var sufix = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '_id';

    return GetSchema(connection).then(function (schema) {
        return AddRelationsByFieldNameToSchema(schema, aliases, ignoreDefaultNames, prefix, sufix);
    }).catch(function (err) {
        console.error(err);
        throw err;
    });
};

var ExportSchemaToFiles = function () {
    var _ref9 = _asyncToGenerator(regeneratorRuntime.mark(function _callee4() {
        var args = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var connection;
        return regeneratorRuntime.wrap(function _callee4$(_context4) {
            while (1) {
                switch (_context4.prev = _context4.next) {
                    case 0:
                        connection = CreateConnection(args);
                        _context4.next = 3;
                        return connection.connect();

                    case 3:
                        return _context4.abrupt('return', GetSchema(connection).then(function () {
                            var _ref10 = _asyncToGenerator(regeneratorRuntime.mark(function _callee2(schema) {
                                var _args$extractRelation, extractRelations, _args$discoverRelatio, discoverRelations, _args$aliases, aliases, _args$ignoreDefaultNa, ignoreDefaultNames, _args$prefix, prefix, _args$sufix, sufix, tables, tableNames;

                                return regeneratorRuntime.wrap(function _callee2$(_context2) {
                                    while (1) {
                                        switch (_context2.prev = _context2.next) {
                                            case 0:
                                                _args$extractRelation = args.extractRelations, extractRelations = _args$extractRelation === undefined ? true : _args$extractRelation, _args$discoverRelatio = args.discoverRelations, discoverRelations = _args$discoverRelatio === undefined ? false : _args$discoverRelatio, _args$aliases = args.aliases, aliases = _args$aliases === undefined ? [] : _args$aliases, _args$ignoreDefaultNa = args.ignoreDefaultNames, ignoreDefaultNames = _args$ignoreDefaultNa === undefined ? false : _args$ignoreDefaultNa, _args$prefix = args.prefix, prefix = _args$prefix === undefined ? 'id_' : _args$prefix, _args$sufix = args.sufix, sufix = _args$sufix === undefined ? '_id' : _args$sufix;

                                                if (args.discoverRelations) {
                                                    schema = AddRelationsByFieldNameToSchema(schema, aliases, ignoreDefaultNames, prefix, sufix);
                                                }

                                                if (!args.extractRelations) {
                                                    _context2.next = 4;
                                                    break;
                                                }

                                                return _context2.abrupt('return', AddRelationsToSchema(connection, schema).then(function () {
                                                    var _ref11 = _asyncToGenerator(regeneratorRuntime.mark(function _callee(res) {
                                                        var tables, tableNames;
                                                        return regeneratorRuntime.wrap(function _callee$(_context) {
                                                            while (1) {
                                                                switch (_context.prev = _context.next) {
                                                                    case 0:
                                                                        _context.next = 2;
                                                                        return connection.end();

                                                                    case 2:
                                                                        tables = res.tables;
                                                                        tableNames = Object.keys(tables);

                                                                        tableNames.forEach(function (tableName, index, array) {
                                                                            CreateFileWithContent(tableName, tables[tableName], args.outputFolder);
                                                                        });

                                                                    case 5:
                                                                    case 'end':
                                                                        return _context.stop();
                                                                }
                                                            }
                                                        }, _callee, undefined);
                                                    }));

                                                    return function (_x13) {
                                                        return _ref11.apply(this, arguments);
                                                    };
                                                }()));

                                            case 4:
                                                _context2.next = 6;
                                                return connection.end();

                                            case 6:
                                                tables = schema.tables;
                                                tableNames = Object.keys(tables);

                                                tableNames.forEach(function (tableName, index, array) {
                                                    CreateFileWithContent(tableName, tables[tableName], args.outputFolder);
                                                });

                                            case 9:
                                            case 'end':
                                                return _context2.stop();
                                        }
                                    }
                                }, _callee2, undefined);
                            }));

                            return function (_x12) {
                                return _ref10.apply(this, arguments);
                            };
                        }()).catch(function () {
                            var _ref12 = _asyncToGenerator(regeneratorRuntime.mark(function _callee3(err) {
                                return regeneratorRuntime.wrap(function _callee3$(_context3) {
                                    while (1) {
                                        switch (_context3.prev = _context3.next) {
                                            case 0:
                                                console.error(err);
                                                _context3.next = 3;
                                                return connection.end();

                                            case 3:
                                            case 'end':
                                                return _context3.stop();
                                        }
                                    }
                                }, _callee3, undefined);
                            }));

                            return function (_x14) {
                                return _ref12.apply(this, arguments);
                            };
                        }()));

                    case 4:
                    case 'end':
                        return _context4.stop();
                }
            }
        }, _callee4, undefined);
    }));

    return function ExportSchemaToFiles() {
        return _ref9.apply(this, arguments);
    };
}();

var ExportSchemaToFile = function () {
    var _ref13 = _asyncToGenerator(regeneratorRuntime.mark(function _callee8() {
        var args = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var connection;
        return regeneratorRuntime.wrap(function _callee8$(_context8) {
            while (1) {
                switch (_context8.prev = _context8.next) {
                    case 0:
                        connection = CreateConnection(args);
                        _context8.next = 3;
                        return connection.connect();

                    case 3:
                        return _context8.abrupt('return', GetSchema(connection).then(function () {
                            var _ref14 = _asyncToGenerator(regeneratorRuntime.mark(function _callee6(schema) {
                                var _args$extractRelation2, extractRelations, _args$discoverRelatio2, discoverRelations, _args$aliases2, aliases, _args$ignoreDefaultNa2, ignoreDefaultNames, _args$prefix2, prefix, _args$sufix2, sufix, tables;

                                return regeneratorRuntime.wrap(function _callee6$(_context6) {
                                    while (1) {
                                        switch (_context6.prev = _context6.next) {
                                            case 0:
                                                _args$extractRelation2 = args.extractRelations, extractRelations = _args$extractRelation2 === undefined ? true : _args$extractRelation2, _args$discoverRelatio2 = args.discoverRelations, discoverRelations = _args$discoverRelatio2 === undefined ? false : _args$discoverRelatio2, _args$aliases2 = args.aliases, aliases = _args$aliases2 === undefined ? [] : _args$aliases2, _args$ignoreDefaultNa2 = args.ignoreDefaultNames, ignoreDefaultNames = _args$ignoreDefaultNa2 === undefined ? false : _args$ignoreDefaultNa2, _args$prefix2 = args.prefix, prefix = _args$prefix2 === undefined ? 'id_' : _args$prefix2, _args$sufix2 = args.sufix, sufix = _args$sufix2 === undefined ? '_id' : _args$sufix2;

                                                if (args.discoverRelations) {
                                                    schema = AddRelationsByFieldNameToSchema(schema, aliases, ignoreDefaultNames, prefix, sufix);
                                                }

                                                if (!args.extractRelations) {
                                                    _context6.next = 4;
                                                    break;
                                                }

                                                return _context6.abrupt('return', AddRelationsToSchema(connection, schema).then(function () {
                                                    var _ref15 = _asyncToGenerator(regeneratorRuntime.mark(function _callee5(res) {
                                                        var tables;
                                                        return regeneratorRuntime.wrap(function _callee5$(_context5) {
                                                            while (1) {
                                                                switch (_context5.prev = _context5.next) {
                                                                    case 0:
                                                                        _context5.next = 2;
                                                                        return connection.end();

                                                                    case 2:
                                                                        tables = res.tables;

                                                                        CreateFileWithContent(args.database + '.schema', tables, args.outputFolder);

                                                                    case 4:
                                                                    case 'end':
                                                                        return _context5.stop();
                                                                }
                                                            }
                                                        }, _callee5, undefined);
                                                    }));

                                                    return function (_x17) {
                                                        return _ref15.apply(this, arguments);
                                                    };
                                                }()));

                                            case 4:
                                                _context6.next = 6;
                                                return connection.end();

                                            case 6:
                                                tables = schema.tables;

                                                CreateFileWithContent(args.database + '.schema', tables, args.outputFolder);

                                            case 8:
                                            case 'end':
                                                return _context6.stop();
                                        }
                                    }
                                }, _callee6, undefined);
                            }));

                            return function (_x16) {
                                return _ref14.apply(this, arguments);
                            };
                        }()).catch(function () {
                            var _ref16 = _asyncToGenerator(regeneratorRuntime.mark(function _callee7(err) {
                                return regeneratorRuntime.wrap(function _callee7$(_context7) {
                                    while (1) {
                                        switch (_context7.prev = _context7.next) {
                                            case 0:
                                                console.error(err);
                                                _context7.next = 3;
                                                return connection.end();

                                            case 3:
                                            case 'end':
                                                return _context7.stop();
                                        }
                                    }
                                }, _callee7, undefined);
                            }));

                            return function (_x18) {
                                return _ref16.apply(this, arguments);
                            };
                        }()));

                    case 4:
                    case 'end':
                        return _context8.stop();
                }
            }
        }, _callee8, undefined);
    }));

    return function ExportSchemaToFile() {
        return _ref13.apply(this, arguments);
    };
}();

/**
 * Look for the relationships where a table points to other tables.
 * Check by 'naming convention' like <prefix><tableName> or <tableName><sufix>, where by default prefix = 'id_' and sufix = '_id'.
 * Or check by specific aliases.
 * @param {String} tableName - the name of the table that are pointing to others
 * @param {Object} schema - the current schema
 * @param {Array} aliases - some specifics cases like: [ {localTable: 'table1', localField: 'the_table2_id', foreignTable: 'table2', foreignField: 'id'},
 *                  {localTable: 'table1', localField: 'table_3_id_x', foreignTable: 'table3', foreignField: 'id'}]
 * @param {Boolean} ignoreDefaultNames - if you want ignore the default 'naming convention'
 * @param {String} prefix - prefix for foreign key, ie: <prefix><tableName>, if prefix = 'id_', and tableName = 'table1' then
 *                  id_table1 will be mapped as a foreign key.
 * @param {String} sufix - sufix for foreign key, ie: <tableName><sufix>, if sufix = '_id', and tableName = 'table1' then
 *                  table1_id will be mapped as a foreign key.
 */
var GetRelationsFromTableByFieldNames = function GetRelationsFromTableByFieldNames(tableName, schema) {
    var aliases = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    var ignoreDefaultNames = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
    var prefix = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 'id_';
    var sufix = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : '_id';

    var relations = schema.tables[tableName].relationsFromTable || [];
    var tableNames = Object.keys(schema.tables);

    // Create the possibles names of a foreing keys
    var possibleForeignKeysNames = [];
    !ignoreDefaultNames && tableNames.forEach(function (currTableName, index, array) {

        var fields = schema.tables[currTableName].fields;
        var keys = _lodash2.default.filter(fields, function (f) {
            return f.Key === "PRI";
        });
        var key = keys.length > 0 ? keys[0].Field : 'id';

        possibleForeignKeysNames.push({
            tableName: currTableName,
            localField: ('' + currTableName + sufix).toUpperCase(),
            foreignField: key
        });
        possibleForeignKeysNames.push({
            tableName: currTableName,
            localField: ('' + prefix + currTableName).toUpperCase(),
            foreignField: key
        });
    });

    var fields = schema.tables[tableName].fields;
    !ignoreDefaultNames && fields.forEach(function (field) {
        // For each field of the current table
        var fieldUpper = field.Field.toUpperCase();
        var possible = _lodash2.default.findIndex(possibleForeignKeysNames, function (p) {
            return p.localField === fieldUpper;
        });
        if (possible >= 0) {
            // If exists some foreign key
            var relationExists = _lodash2.default.findIndex(relations, function (p) {
                return p.localField === field.Field && p.foreignTable === possibleForeignKeysNames[possible].tableName && p.foreignField === possibleForeignKeysNames[possible].foreignField;
            });

            if (relationExists < 0) {
                relations.push({
                    localField: field.Field,
                    foreignTable: possibleForeignKeysNames[possible].tableName,
                    foreignField: possibleForeignKeysNames[possible].foreignField
                });
                field.isForeignKey = true;
            }
            var inverseRelationExists = _lodash2.default.findIndex(schema.tables[possibleForeignKeysNames[possible].tableName].relationsToTable, function (p) {
                return p.localField === possibleForeignKeysNames[possible].foreignField && p.foreignTable === tableName && p.foreignField === field.Field;
            });
            inverseRelationExists < 0 && schema.tables[possibleForeignKeysNames[possible].tableName].relationsToTable.push({
                localField: possibleForeignKeysNames[possible].foreignField,
                foreignTable: tableName,
                foreignField: field.Field
            });
        }
    });

    aliases.forEach(function (alias, index, array) {
        // check if the relation exists
        var relationExists = _lodash2.default.findIndex(relations, function (r) {
            return r.localField === alias.localField && r.foreignTable === alias.foreignTable && r.foreignField === alias.foreignField;
        });
        if (relationExists < 0) {
            relations.push({
                localField: alias.localField,
                foreignTable: alias.foreignTable,
                foreignField: alias.foreignField
            });
            var fieldFKIndex = _lodash2.default.findIndex(schema.tables[tableName].fields, function (f) {
                return f.Field === alias.localField;
            });
            if (fieldFKIndex >= 0) {
                schema.tables[tableName].fields[fieldFKIndex].isForeignKey = true;
            }
        }
        var inverseRelationExists = _lodash2.default.findIndex(schema.tables[alias.foreignTable].relationsToTable, function (p) {
            return p.localField === alias.foreignField && p.foreignTable === alias.localTable && p.foreignField === alias.localField;
        });
        inverseRelationExists < 0 && schema.tables[alias.foreignTable].relationsToTable.push({
            localField: alias.foreignField,
            foreignTable: alias.localTable,
            foreignField: alias.localField
        });
    });

    return relations;
};

/**
 * Look for relationships where the tables are pointing to a specific one.
 * Check by 'naming convention' like <prefix><tableName> or <tableName><sufix>, where by default prefix = 'id_' and sufix = '_id'.
 * Or check by specific aliases.
 * @param {String} tableName - the name of the table that others are pointing
 * @param {Object} schema - the current schema
 * @param {Array} aliases - some specifics cases like: [ {localTable: 'table1', localField: 'id', foreignTable: 'table2', foreignField: 'the_table1_id'},
 *                  {localTable: 'table1', localField: 'id', foreignTable: 'table3', foreignField: 'table_1_id_x'}]
 * @param {Boolean} ignoreDefaultNames - if you want ignore the default 'naming convention'
 * @param {String} prefix - prefix for foreign key, ie: <prefix><tableName>, if prefix = 'id_', and tableName = 'table1' then
 *                  id_table1 will be mapped as a foreign key.
 * @param {String} sufix - sufix for foreign key, ie: <tableName><sufix>, if sufix = '_id', and tableName = 'table1' then
 *                  table1_id will be mapped as a foreign key.
 */
var GetRelationsToTableByFieldNames = function GetRelationsToTableByFieldNames(tableName, schema) {
    var aliases = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    var ignoreDefaultNames = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
    var prefix = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 'id_';
    var sufix = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : '_id';

    var relations = schema.tables[tableName].relationsToTable || [];

    var keys = _lodash2.default.filter(schema.tables[tableName].fields, function (f) {
        return f.Key === "PRI";
    });
    var key = keys.length > 0 ? keys[0].Field : 'id';

    //possibles names of a potential foreignKey that is pointing to this table
    var possibleForeignKeysNames = [('' + tableName + sufix).toUpperCase(), ('' + prefix + tableName).toUpperCase()];

    var tableNames = Object.keys(schema.tables);
    !ignoreDefaultNames && tableNames.forEach(function (currTableName, index, array) {
        // for each table, looking for foreign keys

        var fields = schema.tables[currTableName].fields; // fields of the foreign table
        var possible1 = _lodash2.default.findIndex(fields, function (f) {
            return f.Field.toUpperCase() === possibleForeignKeysNames[0];
        });
        var possible2 = _lodash2.default.findIndex(fields, function (f) {
            return f.Field.toUpperCase() === possibleForeignKeysNames[1];
        });
        if (possible1 >= 0 || possible2 >= 0) {
            var possible = possible1 >= 0 ? possible1 : possible2;
            var relationExists = _lodash2.default.findIndex(relations, function (p) {
                return p.localField === key && p.foreignTable === currTableName && p.foreignField === fields[possible].Field;
            });

            relationExists < 0 && relations.push({ localField: key, foreignTable: currTableName, foreignField: fields[possible].Field });

            var inverseRelationExists = _lodash2.default.findIndex(schema.tables[currTableName].relationsFromTable, function (p) {
                return p.localField === fields[possible].Field && p.foreignTable === tableName && p.foreignField === key;
            });
            if (inverseRelationExists < 0) {
                schema.tables[currTableName].relationsFromTable.push({
                    localField: fields[possible].Field,
                    foreignTable: tableName,
                    foreignField: key
                });
                var fieldFKIndex = _lodash2.default.findIndex(schema.tables[currTableName].fields, function (f) {
                    return f.Field === possible;
                });
                if (fieldFKIndex >= 0) {
                    schema.tables[currTableName].fields[fieldFKIndex].isForeignKey = true;
                }
            }
        }
    });

    aliases.forEach(function (alias, index, array) {
        // check if the relation exists
        var relationExists = _lodash2.default.findIndex(relations, function (r) {
            return r.localField === alias.foreignField && r.foreignTable === alias.localTable && r.foreignField === alias.localField;
        });
        relationExists < 0 && relations.push({
            localField: alias.foreignField,
            foreignTable: alias.localTable,
            foreignField: alias.localField
        });

        var inverseRelationExists = _lodash2.default.findIndex(schema.tables[alias.localTable].relationsFromTable, function (p) {
            return p.localField === alias.localField && p.foreignTable === alias.foreignTable && p.foreignField === alias.foreignField;
        });
        if (inverseRelationExists < 0) {
            schema.tables[alias.localTable].relationsFromTable.push({
                localField: alias.localField,
                foreignTable: alias.foreignTable,
                foreignField: alias.foreignField
            });
            var fieldFKIndex = _lodash2.default.findIndex(schema.tables[alias.localTable].fields, function (f) {
                return f.Field === alias.localField;
            });
            if (fieldFKIndex >= 0) {
                schema.tables[alias.localTable].fields[fieldFKIndex].isForeignKey = true;
            }
        }
    });
    return relations;
};

module.exports = {
    CreateConnection: CreateConnection,
    CreateConnectionAsync: CreateConnectionAsync,
    GetSchema: GetSchema, // Returns schema without relations
    GetSchemaWithRelations: GetSchemaWithRelations, // Returns schema with relations
    GetSchemaWithRelationsByFieldNames: GetSchemaWithRelationsByFieldNames, // Returns schema with relations by field names.
    GetTableList: GetTableList, // Returns the database's tables list
    GetFieldsFromTable: GetFieldsFromTable, // Returns the field list from a table
    GetRelationsFromTable: GetRelationsFromTable, // Returns the relations from a specific table pointing to others
    GetRelationsToTable: GetRelationsToTable, // Returns the relations from other tables pointing to specific one
    GetRelationsFromTableByFieldNames: GetRelationsFromTableByFieldNames, // Look for the relationships where a table points to other tables.
    GetRelationsToTableByFieldNames: GetRelationsToTableByFieldNames, // Look for relationships where the tables are pointing to a specific one.
    ExportSchemaToFiles: ExportSchemaToFiles, // Creates an schema and export that to outputPath on separate files
    ExportSchemaToFile: ExportSchemaToFile // Creates an schema and export that to outputPath on a file
};