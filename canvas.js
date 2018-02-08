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

	var canvas = $canvas[0];
	var context = this.context = canvas.getContext("2d");

	var initialWidth = canvas.width;
	var initialHeight = canvas.height;

	var image, cropSource;

	this.width = function (width) {
		if (typeof width == "undefined") {
			return canvas.width;
		}

		canvas.width = width;
	}

	this.height = function (height) {
		if (typeof height == "undefined") {
			return canvas.height;
		}

		canvas.height = height;
	}

	//draw pasted image to canvas
	this.create = function (source) {
		var pastedImage = image = new Image();
		pastedImage.onload = function () {
			//resize
			canvas.width = pastedImage.width;
			canvas.height = pastedImage.height;

			context.drawImage(pastedImage, 0, 0);
		};
		pastedImage.src = source;
	}

	this.crop = function (source) {
		cropSource = source;
		this.redraw();
	}

	this.redraw = function () {
		if (image) {
			context.drawImage(image, 0, 0);
		}
		else if (cropSource) {
			var left = parseInt($("#left").val());
			var top = parseInt($("#top").val());
			var right = parseInt($("#right").val());
			var bottom = parseInt($("#bottom").val());

			if (isNaN(left) || isNaN(top)
			|| isNaN(right) || isNaN(bottom)) {
				canvas.width = initialWidth;
				canvas.height = initialHeight;
				context.clearRect();
				console.log("Tried to render a crop without all coordinates discovered.");
			}

			var width = right - left + 1;
			var height = bottom - top + 1;

			var data = cropSource.context.getImageData(left, top, width, height);

			canvas.width = width;
			canvas.height = height;
			context.putImageData(data, 0, 0);
		}
	}

	this.profile = function (x, y, width, height, data) {
		x = x || 0;
		y = y || 0;
		width = width || canvas.width;
		height = height || canvas.height;
		data = data || new COLORBIN();

		var pixels = context.getImageData(x, y, width, height).data;
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
	}

	this.profileRects = function (rects) {
		var data = new COLORBIN();
		for (var y = 0; y < canvas.height; y += 24) {
			for (var x = 0; x < canvas.width; x += 24) {
				for (let rect of rects) {
					this.profile(x + rect[0], y + rect[1], rect[2], rect[3], data);
				}
			}
		}

		return data;
	}

	this.hideRectsIf = function (rects, erase) {
		for (var y = 0; y < canvas.height; y += 24) {
			for (var x = 0; x < canvas.width; x += 24) {
				for (let rect of rects) {
					var destX = x + rect[0], destY = y + rect[1];
					var width = rect[2], height = rect[3];
					var pixels = context.getImageData(destX, destY, width, height);
					var data = pixels.data;

					for (var p = 0; p < data.length; p += 4) {
						var color = (data[p] << 16) + (data[p + 1] << 8) + data[p + 2];

						if (COLORBIN.isPixel(color, erase)) {
							data[p + 3] = 0;
						}
					}

					context.putImageData(pixels, destX, destY);
				}
			}
		}
	}

	this.getPixel = function (x, y) {
		// Need to compare with == so ...
		var p = context.getImageData(x, y, 1, 1).data;
		return (p[0] << 16) + (p[1] << 8) + p[2];
	}

	this.isPixel = function (x, y, pixel, tolerance) {
		return COLORBIN.isPixel(this.getPixel(x, y), pixel, tolerance);
	}
}

Object
