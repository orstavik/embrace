#!/bin/bash

npx rollup --input src/DD.js --file DD.js --format=esm --sourcemap --no-treeshake --preserveEntrySignatures=strict
npx rollup --input src/DDCompile.js --file DDCompile.js --format=esm --sourcemap --no-treeshake --preserveEntrySignatures=strict

output_files=$(find . -maxdepth 1 -type f -name "*.js" -o -name "*.js.map")
git add $output_files

# collate all the /test/*.html files into all.html
#find test -name "*.html" ! -name "index.html" ! -name "all.html" -exec cat {} + > test/all.html
#git add test/all.html

