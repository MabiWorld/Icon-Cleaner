/**
 * extended canvas functions
 * 
 * @param {string} selector - selector (or jQuery object) of a canvas element
 */
function CANVAS(selector) {
	var _self = this;
	var $canvas = $(selector);

	if (!$canvas.length || $canvas[0].tagName != "CANVAS") {
		console.error("Bad selector for canvas.");
		return;
	}

	this.canvas = $canvas[0];
	this.context = this.canvas.getContext("2d");

	this.initialWidth = this.canvas.width;
	this.initialHeight = this.canvas.height;

	this.image = null;
	this.cropSource = null;
}

PUBLIC(CANVAS, "width", function (width) {
	if (typeof width == "undefined") {
		return this.canvas.width;
	}

	this.canvas.width = width;
});

PUBLIC(CANVAS, "height", function (height) {
	if (typeof height == "undefined") {
		return this.canvas.height;
	}

	this.canvas.height = height;
});

//draw pasted image to canvas
PUBLIC(CANVAS, "create", function (source) {
	var pastedImage = this.image = new Image();
	var self = this;
	pastedImage.onload = function () {
		//resize
		self.canvas.width = pastedImage.width;
		self.canvas.height = pastedImage.height;

		self.context.drawImage(pastedImage, 0, 0);
	};
	pastedImage.src = source;
});

PUBLIC(CANVAS, "crop", function (source) {
	this.cropSource = source;
	this.redraw();
});

PUBLIC(CANVAS, "redraw", function () {
	if (this.image) {
		this.context.drawImage(this.image, 0, 0);
	}
	else if (this.cropSource) {
		var left = parseInt($("#left").val());
		var top = parseInt($("#top").val());
		var right = parseInt($("#right").val());
		var bottom = parseInt($("#bottom").val());

		if (isNaN(left) || isNaN(top)
		|| isNaN(right) || isNaN(bottom)) {
			this.canvas.width = this.initialWidth;
			this.canvas.height = this.initialHeight;
			this.context.clearRect(0, 0, this.initialWidth, this.initialHeight);
			console.log("Tried to render a crop without all coordinates discovered.");
			return;
		}

		var width = right - left + 1;
		var height = bottom - top + 1;

		var data = this.cropSource.context.getImageData(left, top, width, height);

		this.canvas.width = width;
		this.canvas.height = height;
		this.context.putImageData(data, 0, 0);
	}
});

PUBLIC(CANVAS, "search", function (patterns, tolerance, left, top, width, height) {
	// patterns = [pattern, ...]
	// pattern = [
	//     [x0, x1, x2] // y = 0
	//     [x0, x1, x2] // y = 1
	// ]
	// x# = color as int, a string as a variable name, or such a string with a ! for negation.
	tolerance = tolerance || 1;
	left = left || 0;
	top = top || 0;
	width = width || this.canvas.width;
	height = height || this.canvas.height;
	var bound = 4 * width;

	// Convert bin to something easier to manage and use == on.
	var rawPixels = this.context.getImageData(left, top, width, height).data, pixels = [], row;
	for (let p = 0; p < rawPixels.length; p += 4) {
		var color = (rawPixels[p] << 16) + (rawPixels[p + 1] << 8) + rawPixels[p + 2];

		if (p % bound == 0) {
			row = [];
			pixels.push(row);
		}

		row.push(color);
	}

	// Just wanted pixels.
	if (!patterns) return;
	if (!patterns.length) return [];

	// Copy patterns.
	var remaining = {};
	for (let i = patterns.length - 1; i >= 0; --i) {
		remaining[i] = patterns[i];
	}

	// Scan for the patterns...
	var results = new Array(patterns.length);
	for (let i = patterns.length - 1; i >= 0; --i) {
		results[i] = [];
	}

	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			for (let i in remaining) {
				var pattern = remaining[i], matched = true, vars = {}, notVars = {};
				
				for (let py = pattern.length - 1; py >= 0; --py) {
					var pRow = pattern[py];
					var row = pixels[y + py];

					// Remove this pattern if we're too low.
					if (row == undefined) {
						delete remaining[i];
						continue;
					}

					for (let px = pRow.length - 1; px >= 0; --px) {
						var p = pRow[px];
						var c = row[x + px];

						if (c == undefined) {
							// Too far to the right.

							matched = false;
							break;
						}

						if (typeof p == "string") {
							// Variable.
							if (p[0] == "!") {
								// Negation of variable.
								p = p.substr(1);
								if (p in vars) {
									if (COLORBIN.isPixel(c, vars[p], tolerance)) {
										// If it's the same color as previously determined for this var.
										matched = false;
										break;
									}
								}
								else {
									notVars[p] = c;
								}
							}
							else {
								if (p in vars) {
									if (!COLORBIN.isPixel(c, vars[p], tolerance)) {
										// If it's not the same color as previously determined for this var.
										matched = false;
										break;
									}
								}
								else if (p in notVars) {
									if (COLORBIN.isPixel(c, notVars[p], tolerance)) {
										// If it's the color we determined it shouldn't be.
										matched = false;
										break;
									}

									vars[p] = c;
								}
								else {
									notVars[p] = c;
								}
							}
						}
						else if (!COLORBIN.isPixel(c, p, tolerance)) {
							// If not same literal color.
							matched = false;
							break;
						}
					}

					if (!matched) break;
				}

				if (matched) {
					// Found this pattern at this point.
					results[parseInt(i)].push({
						"pos": [x, y],
						"vars": vars,
					});
				}
			}
		}
	}

	this.pixels = pixels;
	return results;
});

PUBLIC(CANVAS, "profile", function (x, y, width, height, data) {
	x = x || 0;
	y = y || 0;
	width = width || this.canvas.width;
	height = height || this.canvas.height;
	data = data || new COLORBIN();

	var pixels = this.context.getImageData(x, y, width, height).data;
	for (var p = 0; p < pixels.length; p += 4) {
		var color = (pixels[p] << 16) + (pixels[p + 1] << 8) + pixels[p + 2], cc;

		if ((cc = data.hasPixel(color)) != null) {
			++data[cc];
		}
		else {
			data[color] = 1;
		}
	}

	return data;
});

PUBLIC(CANVAS, "profileRects", function (rects) {
	var data = new COLORBIN();
	for (var y = 0; y < this.canvas.height; y += 24) {
		for (var x = 0; x < this.canvas.width; x += 24) {
			for (let rect of rects) {
				this.profile(x + rect[0], y + rect[1], rect[2], rect[3], data);
			}
		}
	}

	return data;
});

PUBLIC(CANVAS, "hideRectsIf", function (rects, erase) {
	var hex = getColorAsHex(erase);

	for (var y = 0; y < this.canvas.height; y += 24) {
		for (var x = 0; x < this.canvas.width; x += 24) {
			for (let rect of rects) {
				var destX = x + rect[0], destY = y + rect[1];
				var width = rect[2], height = rect[3];
				var pixels = this.context.getImageData(destX, destY, width, height);
				var data = pixels.data;

				for (var p = 0; p < data.length; p += 4) {
					var color = (data[p] << 16) + (data[p + 1] << 8) + data[p + 2];

					if (chromatism.difference(getColorAsHex(color), hex) < 40) {
						data[p + 3] = 0;
					}
				}

				this.context.putImageData(pixels, destX, destY);
			}
		}
	}
});

PUBLIC(CANVAS, "getPixel", function (x, y) {
	// Need to compare with == so ...
	var p = this.context.getImageData(x, y, 1, 1).data;
	return (p[0] << 16) + (p[1] << 8) + p[2];
});

PUBLIC(CANVAS, "isPixel", function (x, y, pixel, tolerance) {
	return COLORBIN.isPixel(this.getPixel(x, y), pixel, tolerance);
});
