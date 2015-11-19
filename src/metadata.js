'use strict';

var path = require('path');
var fs = require('fs');

require('string.fromcodepoint');
require('string.prototype.codepointat');


function getMetadataService(options) {
  var usedUnicodes = {};

  // Default options
  options = options || {};
  options.appendUnicode = !!options.appendUnicode;
  options.startUnicode = 'number' === typeof options.startUnicode ?
    options.startUnicode :
    0xEA01;
  options.log = options.log || console.log;
  options.err = options.err || console.err;

  return function getMetadataFromFile(file, cb) {
    var ligature = path.basename(file).replace(/\.svg$/, '');

    var metadata = {
      path: file,
      name: ligature,
      unicode: []
    };


    if( ligature.length === 0 ){ return; }

    // If there are spaces in it
    if( ligature.match(/\s/) ){ return; }


    // Note: for strange fontforge IE10 bug
    if( ligature.length === 16 ){
      ligature = ligature.slice(0, 15);
    }

    // If already used
    if (usedUnicodes[ligature]) { console.log(ligature, 'is already being used by', usedUnicodes[ligature]); return; }

    // Mark as occupied
    usedUnicodes[ligature] = ligature;

    // If hex
    if (ligature.match(/^[0-9A-Fa-f]+$/)) {
      metadata.unicode.push(String.fromCodePoint(parseInt(ligature, 16)));
    }else{
      metadata.unicode.push(ligature);
    }

    setImmediate(function() {
      cb(null, metadata);
    });
  };

}

module.exports = getMetadataService;
