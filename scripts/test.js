var path = require('path');
var fs = require('fs');
var csstree = require('css-tree');
var syntax = csstree.lexer;
var dir = path.join(__dirname, '../data');
var sites = require('./sites');
var readmeFile = path.join(__dirname, '../README.md');
var readme = fs.readFileSync(readmeFile, 'utf-8');

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function inject(name, text) {
    var parts = readme.split(new RegExp('(<!-- /?' + name + ' -->)'));
    parts[2] = '\n\n' + text + '\n\n';
    readme = parts.join('');
}

function validate(ast) {
    var errors = [];

    try {
        csstree.walkDeclarations(ast, function(node) {
            if (!syntax.matchProperty(node.property, node.value)) {
                var error = syntax.lastMatchError;
                var message = error.rawMessage || error.message || error;

                if (message === 'Mismatch') {
                    message = 'Invalid value for `' + node.property + '`';
                } else if (message === 'Uncomplete match') {
                    message = 'The rest part of value can\'t to be matched on `' + node.property + '` syntax';
                }

                errors.push({
                    node: node,
                    loc: error.loc || node.loc,
                    line: error.line || node.loc && node.loc.start && node.loc.start.line,
                    column: error.column || node.loc && node.loc.start && node.loc.start.column,
                    property: node.property,
                    message: message,
                    error: syntax.lastMatchError
                });
            }
        });
    } catch (e) {
        return e;
    }

    return errors;
}

function validationErrorStat(errors) {
    var viewed = {};
    return errors.reduce(function(stat, error) {
        stat.total++;

        if (!viewed.hasOwnProperty(error.message)) {
            stat.unique++;
            viewed[error.message] = true;
        }

        return stat;
    }, {
        total: 0,
        unique: 0
    });
}

function formatErrors(error) {
    var output = [];

    if (Array.isArray(error)) {
        output.push.apply(output, error.map(function(item) {
            return '* ' +
                String(item.error.message || item.error)
                    .replace(/^[^\n]+/, item.message)
                    .replace(/\n/g, '\n  ');
        }));
    } else {
        output.push('[ERROR] ' + error);
    }

    return output.join('\n');
}

var reports = sites.map(function(url, idx) {
    var fullfn = dir + '/' + idx + '.css';
    var report = {
        url: url,
        downloaded: false,
        error: null,
        validation: null
    };

    console.log('Test #' + idx + ' ' + url);

    if (fs.existsSync(fullfn)) {
        report.downloaded = true;

        var css = fs.readFileSync(fullfn, 'utf8');
        var host = css.match(/^\/\*\s*([^*]+)\s*\*\//)[1];

        try {
            var ast = csstree.parse(css, { positions: true });
            console.log('  Parsed successful');

            var errors = validate(ast);
            if (errors.length) {
                console.log('  Warnings: ' + errors.length);
                report.validation = errors;
            } else {
                console.log('  No warnings');
            }
        } catch (e) {
            console.log('  [ERROR] Parsing: ' + e.message);
            report.error = {
                e: e,
                message: e.message,
                details: e.formattedMessage || e.message
            };
        }
    } else {
        console.log('  Missed');
    }

    console.log();

    return report;
});

inject('date', 'Update date: ' + new Date().toISOString());
inject('table',
    '<table>\n' +
    '<thead>\n' +
      '<tr><th>' + ['#', 'Site', '', 'Parsing', 'Validation'].join('</th><th>') + '</th></tr>\n' +
    '</thead>\n' +
    reports.map(function(report, idx) {
        var cells = [
            idx,
            report.downloaded && !report.error && !report.validation ? '🆗' : '⚠️',
            report.url
        ];

        if (report.downloaded) {
            cells.push(
                report.error
                    ? '<details>' +
                        '<summary>Error</summary>' +
                        '<pre>' + escapeHTML(report.error.details) + '</pre>' +
                      '</details>'
                    : 'OK',
                report.validation
                    ? '<details>' +
                        '<summary>' +
                            report.validation.length + (report.validation.length > 1 ? ' warnings' : ' warning') +
                            ' (unique: ' + validationErrorStat(report.validation).unique + ')' +
                        '</summary>' +
                        '<pre>' + escapeHTML(formatErrors(report.validation)) + '</pre>' +
                      '</details>'
                    : (report.error ? '–' : 'OK')
            );
            return '<tr><td>' + cells.join('</td><td>') + '</td></tr>';
        } else {
            return '<tr><td>' + cells.join('</td><td>') + '</td><td colspan="2">–</td></tr>';
        }
        
    }).join('\n') + '</table>'
);

fs.writeFileSync(readmeFile, readme, 'utf8');

// totals

var missedCount = reports.filter(function(report) {
    return report.downloaded;
}).length;
var parseErrorCount = reports.filter(function(report) {
    return report.error;
}).length;
var passed = reports.filter(function(report) {
    return report.downloaded && !report.error && !report.validation;
}).length;

console.log('Total sites:', reports.length);
console.log('Missed CSS:', missedCount);
console.log('Parsing:');
console.log('  Sucessful:', reports.length - parseErrorCount);
console.log('  Failed:', parseErrorCount);
console.log('All tests passed:', passed);