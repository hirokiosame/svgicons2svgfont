'use strict';

// Required modules
var util = require('util');
var Stream = require('readable-stream');
var Sax = require('sax');
var SVGPathData = require('svg-pathdata');

require('string.prototype.codepointat');

// Transform helpers (will move elsewhere later)
function parseTransforms(value) {
	return value
		.match(/(rotate|translate|scale|skewX|skewY|matrix)\s*\(([^\)]*)\)\s*/g)
		.map(transform => transform.match(/[\w\.\-]+/g));
}

function transformPath(path, transforms) {

	console.log(path);
	for (let transform of transforms) {
		path[transform[0]].apply(path, transform.slice(1).map(n => parseFloat(n, 10)));
	}

	return path;
}

function applyTransforms(d, parents) {
	var transforms = [];

	for (let parent of parents) {
		if (parent.attributes.transform !== undefined) {
			[].push.apply(transforms, parseTransforms(parent.attributes.transform))
		}
	}

	return transformPath(new SVGPathData(d), transforms).encode();
}

// Rendering
function tagShouldRender(curTag, parents) {
	return !parents.some(function(tag) {

		if (undefined !== tag.attributes.display && 'none' === tag.attributes.display.toLowerCase()) {
			return true;
		}

		if (undefined !== tag.attributes.width && 0 === parseFloat(tag.attributes.width, 0)) {
			return true;
		}

		if (undefined !== tag.attributes.height && 0 === parseFloat(tag.attributes.height, 0)) {
			return true;
		}

		if (undefined !== tag.attributes.viewBox) {
			var values = tag.attributes.viewBox.split(/\s*,*\s|\s,*\s*|,/);
			if (0 === parseFloat(values[2]) || 0 === parseFloat(values[3])) {
				return true;
			}
		}
	});
}

// Shapes helpers (should also move elsewhere)
function rectToPath(attributes) {
	var x = undefined !== attributes.x ? parseFloat(attributes.x, 10) : 0;
	var y = undefined !== attributes.y ? parseFloat(attributes.y, 10) : 0;
	var width = undefined !== attributes.width ? parseFloat(attributes.width, 10) : 0;
	var height = undefined !== attributes.height ? parseFloat(attributes.height, 10) : 0;
	var rx = undefined !== attributes.rx ? parseFloat(attributes.rx, 10) : 0;
	var ry = undefined !== attributes.ry ? parseFloat(attributes.ry, 10) : 0;

	return '' +

		// start at the left corner
		'M' + (x + rx) + ' ' + y +

		// top line
		'h' + (width - (rx * 2)) +

		// upper right corner
		(rx || ry ? 'a ' + rx + ' ' + ry + ' 0 0 1 ' + rx + ' ' + ry : '') +

		// Draw right side
		'v' + (height - (ry * 2)) +

		// Draw bottom right corner
		(rx || ry ? 'a ' + rx + ' ' + ry + ' 0 0 1 ' + (rx * -1) + ' ' + ry : '') +
		// Down the down side
		'h' + ((width - (rx * 2)) * -1) +

		// Draw bottom right corner
		(rx || ry ? 'a ' + rx + ' ' + ry + ' 0 0 1 ' + (rx * -1) + ' ' + (ry * -1) : '') +

		// Down the left side
		'v' + ((height - (ry * 2)) * -1) +

		// Draw bottom right corner
		(rx || ry ? 'a ' + rx + ' ' + ry + ' 0 0 1 ' + rx + ' ' + (ry * -1) : '') +

		// Close path
		'z';
}



function lineToPath(attributes) {
	// Move to the line start
	return '' +
		'M' + (parseFloat(attributes.x1, 10) || 0).toString(10) +
		' ' + (parseFloat(attributes.y1, 10) || 0).toString(10) +
		' ' + ((parseFloat(attributes.x1, 10) || 0) + 1).toString(10) +
		' ' + ((parseFloat(attributes.y1, 10) || 0) + 1).toString(10) +
		' ' + ((parseFloat(attributes.x2, 10) || 0) + 1).toString(10) +
		' ' + ((parseFloat(attributes.y2, 10) || 0) + 1).toString(10) +
		' ' + (parseFloat(attributes.x2, 10) || 0).toString(10) +
		' ' + (parseFloat(attributes.y2, 10) || 0).toString(10) +
		'Z';
}


// http://www.whizkidtech.redprince.net/bezier/circle/
var KAPPA = ((Math.sqrt(2) - 1) / 3) * 4;

function circleToPath(attributes) {
	var cx = parseFloat(attributes.cx, 10);
	var cy = parseFloat(attributes.cy, 10);
	var rx = undefined !== attributes.rx ?
		parseFloat(attributes.rx, 10) :
		parseFloat(attributes.r, 10);
	var ry = undefined !== attributes.ry ?
		parseFloat(attributes.ry, 10) :
		parseFloat(attributes.r, 10);

	return '' +
		'M' + (cx - rx) + ',' + cy +
		'C' + (cx - rx) + ',' + (cy + (ry * KAPPA)) +
		' ' + (cx - (rx * KAPPA)) + ',' + (cy + ry) +
		' ' + cx + ',' + (cy + ry) +
		'C' + (cx + (rx * KAPPA)) + ',' + (cy + ry) +
		' ' + (cx + rx) + ',' + (cy + (ry * KAPPA)) +
		' ' + (cx + rx) + ',' + cy +
		'C' + (cx + rx) + ',' + (cy - (ry * KAPPA)) +
		' ' + (cx + (rx * KAPPA)) + ',' + (cy - ry) +
		' ' + cx + ',' + (cy - ry) +
		'C' + (cx - (rx * KAPPA)) + ',' + (cy - ry) +
		' ' + (cx - rx) + ',' + (cy - (ry * KAPPA)) +
		' ' + (cx - rx) + ',' + cy +
		'Z';
}

function polygonToPath(attributes) {
	return 'M' + attributes.points + 'Z';
}


// Constructor
function SVGIcons2SVGFontStream(options) {

	// Ensure new were used
	if (!(this instanceof SVGIcons2SVGFontStream)) {
		return new SVGIcons2SVGFontStream(options);
	}

	this.glyphs = [];

	options = options || {};
	options.fontName = options.fontName || 'iconfont';
	options.fontId = options.fontId || options.fontName;
	options.fixedWidth = options.fixedWidth || false;
	options.descent = options.descent || 0;
	options.round = options.round || 10e12;
	options.metadata = options.metadata || '';

	this.options = options;

	// Parent constructor
	Stream.Transform.call(this, {
		objectMode: true,
	});

	// Setting objectMode separately
	this._writableState.objectMode = true;
	this._readableState.objectMode = false;
}


// Inherit of duplex stream
util.inherits(SVGIcons2SVGFontStream, Stream.Transform);


// Parse input
SVGIcons2SVGFontStream.prototype._transform = function _svgIcons2SVGFontStreamTransform(svgIconStream, unused, svgIconStreamCallback) {

	var glyph = svgIconStream.metadata || {};

	glyph.d = [];

	this.glyphs.push(glyph);


	if (typeof glyph.name !== 'string') {
		this.emit('error', new Error('Please provide a name for the glyph at index ' + (this.glyphs.length - 1)));
	}


	if (this.glyphs.some(anotherGlyph => (anotherGlyph !== glyph && anotherGlyph.name === glyph.name))) {
		this.emit('error', new Error('The glyph name "' + glyph.name + '" must be unique.'));
	}

	if (glyph.unicode instanceof Array && glyph.unicode.length > 0) {
		if (glyph.unicode.some(function(unicodeA, i) {
			return glyph.unicode.some((unicodeB, j) => i !== j && unicodeA === unicodeB);
		})) {
			this.emit('error', new Error('Given codepoints for the glyph "' + glyph.name + '" contain duplicates.'));
		}
	} else if (typeof glyph.unicode !== 'string') {
		this.emit('error', new Error('Please provide a codepoint for the glyph "' + glyph.name + '"'));
	}

	if (this.glyphs.some(anotherGlyph => (anotherGlyph !== glyph && anotherGlyph.unicode === glyph.unicode))) {
		this.emit('error', new Error('The glyph "' + glyph.name + '" codepoint seems to be used already elsewhere.'));
	}


	var parents = [];

	// Parsing each icons asynchronously
	var saxStream = Sax.createStream(true)

	.on('opentag', function(tag) {

		parents.push(tag);

		// Checking if any parent rendering is disabled and exit if so
		if (!tagShouldRender(tag, parents)) {
			return;
		}

		try {

			// Save the view size
			if (tag.name === 'svg') {
				glyph.dX = 0;
				glyph.dY = 0;

				if ('viewBox' in tag.attributes) {
					var values = tag.attributes.viewBox.split(/\s*,*\s|\s,*\s*|,/);
					glyph.dX = parseFloat(values[0], 10);
					glyph.dY = parseFloat(values[1], 10);
					glyph.width = parseFloat(values[2], 10);
					glyph.height = parseFloat(values[3], 10);
				}

				if ('width' in tag.attributes) {
					glyph.width = parseFloat(tag.attributes.width, 10);
				}

				if ('height' in tag.attributes) {
					glyph.height = parseFloat(tag.attributes.height, 10);
				}

				if (!glyph.width || !glyph.height) {
					console.log('Glyph "' + glyph.name + '" has no size attribute on which to get the gylph dimensions (heigh and width or viewBox attributes)');
					glyph.width = 150;
					glyph.height = 150;
				}

			}

			// Clipping path unsupported
			else if ('clipPath' === tag.name) {
				console.log('Found a clipPath element in the icon "' + glyph.name + '" theresult may be different than expected.');
			}

			// Change rect elements to the corresponding path
			else if ('rect' === tag.name && 'none' !== tag.attributes.fill) {
				console.log('rect');
				glyph.d.push(applyTransforms(rectToPath(tag.attributes), parents));
			}

			else if ('line' === tag.name && 'none' !== tag.attributes.fill) {
				console.log('Found a line element in the icon "' + glyph.name + '" the result could be different than expected.');
				glyph.d.push(applyTransforms(lineToPath(tag.attributes), parents));
			}

			else if ('polyline' === tag.name && 'none' !== tag.attributes.fill) {
				console.log('Found a polyline element in the icon "' + glyph.name + '" the result could be different than expected.');
				glyph.d.push(applyTransforms('M' + tag.attributes.points, parents));
			}

			else if ('polygon' === tag.name && 'none' !== tag.attributes.fill) {
				console.log('poly')
				glyph.d.push(applyTransforms(polygonToPath(tag.attributes), parents));
			}

			else if ('circle' === tag.name || 'ellipse' === tag.name && 'none' !== tag.attributes.fill) {
				console.log('circle');
				glyph.d.push(applyTransforms(circleToPath(tag.attributes), parents));
			}

			else if ('path' === tag.name && tag.attributes.d && 'none' !== tag.attributes.fill) {
				console.log('path');
				glyph.d.push(applyTransforms(tag.attributes.d, parents));
			}

		} catch (err) {
			this.emit('error', new Error('Got an error parsing the glyph "' + glyph.name + '": ' + err.message + '.'));
		}
	})
	.on('error', function svgicons2svgfontSaxErrorCb(err) {
		this.emit('error', err);
	})
	.on('closetag', function svgicons2svgfontSaxCloseTagCb() {
		parents.pop();
	})
	.on('end', function svgicons2svgfontSaxEnbCb() {
		svgIconStreamCallback();
	});

	svgIconStream.pipe(saxStream);
};

// Output data
SVGIcons2SVGFontStream.prototype._flush = function _svgIcons2SVGFontStreamFlush(svgFontFlushCallback) {

	var options = this.options;

	var

		// Get widest icon width
		fontWidth = Math.max.apply(Math, this.glyphs.map(glyph => glyph.width)),

		// Use option height or get tallest icon height
		fontHeight = options.fontHeight || Math.max.apply(Math, this.glyphs.map(glyph => glyph.height));


	// If no normalization, and the smallest glyph hieght is smaller than the font height (tallest font height)
	if (!options.normalize && fontHeight > Math.min.apply(Math, this.glyphs.map(glyph => glyph.height))) {
		console.log('The provided icons does not have the same height it could lead to unexpected results. Using the normalize option could solve the problem.');
	}


	console.log(fontWidth, 'x', fontHeight)
	options.ascent = (options.ascent !== undefined) ? options.ascent : fontHeight - options.descent;


	// Output the SVG file
	// (find a SAX parser that allows modifying SVG on the fly)

	var glyphTags = [],
		glyphSet = {};

	this.glyphs.forEach(function(glyph) {


		glyph.d = glyph.d.map(path => path.replace(/(z)(m)/ig, '$1 $2'));

		console.log(glyph);

		var ratio = fontHeight / glyph.height;

		if (options.fixedWidth) {
			glyph.width = fontWidth;
		}

		if (options.normalize) {
			glyph.height = fontHeight; // - glyph.height;//fontHeight - 112; //fontHeight - 129; //874;

			if (!options.fixedWidth) {
				glyph.width *= ratio;
			}
		}

		var d = glyph.d.map(function(cD) {
			return new SVGPathData(cD)
				.toAbs()
				.translate(-glyph.dX, -glyph.dY)
				.scale(options.normalize ? ratio : 1, options.normalize ? ratio : 1)
				.ySymetry(glyph.height)
				.round(options.round)
				.encode();
		}).join(' ');



		if (options.centerHorizontally) {

			// Naive bounds calculation (should draw, then calculate bounds...)
			var pathData = new SVGPathData(d);

			var bounds = {
				x1: Infinity,
				y1: Infinity,
				x2: 0,
				y2: 0,
			};

			pathData.toAbs().commands.forEach(function(command) {
				bounds.x1 = undefined !== command.x && command.x < bounds.x1 ? command.x : bounds.x1;
				bounds.y1 = undefined !== command.y && command.y < bounds.y1 ? command.y : bounds.y1;
				bounds.x2 = undefined !== command.x && command.x > bounds.x2 ? command.x : bounds.x2;
				bounds.y2 = undefined !== command.y && command.y > bounds.y2 ? command.y : bounds.y2;
			});

			d = pathData
				// .translate(((glyph.width - (bounds.x2 - bounds.x1)) / 2) - bounds.x1, -2 )
				.translate(((glyph.width - (bounds.x2 - bounds.x1)) / 2) - bounds.x1)
				.round(options.round)
				.encode();
		}

		// Store glyph per unicode/ligature
		for (let unicode of glyph.unicode) {

			// If hex, convert
			if (!unicode.match(/\w/)) {
				unicode = unicode.split('').map(function(char) {
					return '&#x' + char.codePointAt(0).toString(16).toUpperCase() + ';';
				}).join('');
			}

			// Mark characters
			var l = unicode.length;
			while (l--) {

				// If not set or already 
				if (!glyphSet[unicode[l]]) {
					glyphSet[unicode[l]] = false;
				}
			}

			// If no collision - either not set or a letter
			if (glyphSet[unicode]) {
				throw new Error('Ligature \'' + unicode + '\' is already being used');
			}

			// Add glyph
			glyphTags.push(glyphSet[unicode] = [unicode, `<glyph unicode="${unicode}" glyph-name="${glyph.name}" horiz-adv-x="${glyph.width}" d="${d}" />`]);
		}
	});

	// Sort by ligature/unicode length (important when there is a ligature that is a combination of other ligatures)
	glyphTags.sort((a, b) => b[0].length - a[0].length);
	
	// Add character mapping
	for (let character of Object.keys(glyphSet)) {

		// Make sure it's a marked character
		if (glyphSet[character] === false ) {
			glyphTags.push([character, `<glyph unicode="${character}" glyph-name="${character}" horiz-adv-x="0" d="M0 0z" />`]);
		}
	}


	this.push(
`<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" >
<svg xmlns="http://www.w3.org/2000/svg">
${ options.metadata ? '<metadata>' + options.metadata + '</metadata>' : ''}
<defs>
<font id="${options.fontId}" horiz-adv-x="${fontWidth}">
<font-face font-family="${options.fontName}" units-per-em="${fontHeight}'" ascent="${options.ascent}'" descent="${options.descent}"${options.fontWeight ? ' font-weight="' + options.fontWeight + '" ' : ''}${options.fontStyle ? ' font-style="' + options.fontStyle + '" ' : ''} />
<missing-glyph horiz-adv-x="${fontWidth}" />
${glyphTags.map(glyph => glyph[1]).join('\n')}
</font></defs></svg>
`
	);


	console.log('Font created');

	if (typeof options.callback === 'function') {
		options.callback(this.glyphs);
	}


	svgFontFlushCallback();
};



module.exports = SVGIcons2SVGFontStream;