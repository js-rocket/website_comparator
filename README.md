# Description

This script will compare the pages of two websites for any differences and produce a HTML report showing the pages that differ.

# Usage

Create a configuration file called `wc_config.json` (an example is in the header of the index.js file)

Then run `node index.js`.  The result will be put in a folder called `result`.
Open the `index.htm` in result folder from your web browser to see the pages of the two sites shown side-by-side.
Pages which are the same will have a green colored column between the two page screenshots
Pages which are different will have an orange colored column between the two page screenshots and a number showing the number of pixels that are different

# TODO

The mask field in the pages array in the wc_config.json will be used to draw a black rectangle on the page to mask any areas that are known to be different between the two pages (Such as Google ad tiles).  This is not yet fully implemented.
