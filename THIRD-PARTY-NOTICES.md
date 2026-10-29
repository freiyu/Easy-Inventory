# Third-party notices

The EZI Inventory installer bundles the following third-party software. Each component keeps its own
license. The full license texts ship inside the installed program folder, next to each component.

## Node.js 22 (runtime)

- License: MIT License, plus the licenses of the components Node.js bundles.
- Full text: `node\LICENSE` in the EZI program folder.
- Source: https://github.com/nodejs/node

## MariaDB Server 11.8 (private database)

- License: GNU General Public License, version 2 (GPLv2).
- Full text: `mariadb\COPYING` in the EZI program folder.
- EZI ships the unmodified MariaDB Windows binaries. EZI talks to MariaDB as a separate program over a local network connection.
- Source for the bundled version: https://downloads.mariadb.org/rest-api/mariadb/11.8.9/mariadb-11.8.9.tar.gz (also available from https://mariadb.org/download/).

## WinSW 2.12.0 (Windows service wrapper)

MIT License

Copyright (c) 2008-2020 Kohsuke Kawaguchi, Sun Microsystems, Inc., CloudBees, Inc., Oleg Nenashev and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: https://github.com/winsw/winsw

## npm packages

The EZI program files contain code from npm packages, bundled into `app\main.mjs` and `app\cli.mjs` or shipped in
`app\node_modules` and `app\public`. Their licenses are in each package's folder in `app\node_modules` or listed by
name and version below. The installer build appends this list automatically (installer/stage.sh).
