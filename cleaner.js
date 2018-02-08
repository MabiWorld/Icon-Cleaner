// Adapted from https://stackoverflow.com/a/18387322/734170
$(function () {
	var CLIPBOARD = new CLIPBOARD_CLASS("#cleaner", "#cleaned");

	$(".show-corrections").click(function () {
		if ($(".corrections").toggle().is(":visible")) {
			$(this).text("Hide corrections pane...");
		}
		else {
			$(this).text("Make corrections...");
		}
	});

	$("body").click(function () {
		$("#color-selector").hide();
	});

	$(".selection").click(function (e) {
		var $this = $(this);
		var $sel = $("#color-selector").empty();

		if ($sel.is(":visible")) {
			$sel.hide();
			return;
		}

		var selection = $this.data("selection");
		if (selection) {
			// Limited selection of other colours.
			var $template = $("<span>").addClass("selection");
			for (let c of selection) {
				$template.clone()
					.data("base", c)
					.css("background-color", getColorAsHex(c))
					.click(function () {
						var col = $(this).data("base");
						$this.data("base", col)
							.css("background-color", getColorAsHex(col));
						
						$sel.hide();
						CLIPBOARD.cleanIcon();
					})
					.appendTo($sel);
			}
		}
		else {
			// Select any colour from image.
			CLIPBOARD.crop();
			var cleanCanvas = $("#cleaned")[0];
			var cleanCtx = cleanCanvas.getContext("2d")

			var selCtx, selCanvas = $("<canvas>").attr({
				"width": cleanCanvas.width * 2,
				"height": cleanCanvas.height * 2,
			}).click(function (e) {
				var offset = $(this).offset();
				var x = e.pageX - offset.left;
				var y = e.pageY - offset.top;

				var pixel = getCanvasPixel(selCtx, x, y);
				$this.data("best", pixel)
					.css("background-color", getColorAsHex(pixel));

				$sel.hide();
				CLIPBOARD.cleanIcon();
			}).appendTo($sel)[0];

			var image = cleanCtx.getImageData(0, 0, cleanCanvas.width, cleanCanvas.height)

			selCtx = selCanvas.getContext("2d");
			selCtx.putImageData(scaleImageData(selCtx, image, 2), 0, 0);
		}

		var offset = $this.offset();
		$sel.css({
			"left": offset.left,
			"top": offset.top + $this.height(),
		}).show();

		e.stopPropagation();
	})
});

/**
 * image pasting into canvas
 * 
 * @param {string} rawCanvas - selector for raw pasted image
 * @param {string} finalCanvas - selector for cleaned image
 */
function CLIPBOARD_CLASS(rawCanvas, finalCanvas) {
	var _self = this;
	var $rawCanvas = $(rawCanvas);
	var $finalCanvas = $(finalCanvas);

	if (!$rawCanvas.length || $rawCanvas[0].tagName != "CANVAS") {
		console.error("Bad selector for raw canvas.");
		return;
	}

	if (!$finalCanvas.length || $finalCanvas[0].tagName != "CANVAS") {
		console.error("Bad selector for final canvas.");
		return;
	}

	var rawCanvas = $rawCanvas[0];
	var rawContext = rawCanvas.getContext("2d");

	var finalCanvas = $finalCanvas[0];
	var finalContext = finalCanvas.getContext("2d");

	var image;

	//handlers
	document.addEventListener('paste', function (e) { _self.paste_auto(e); }, false);

	//on paste
	this.paste_auto = function (e) {
		if (e.clipboardData) {
			var items = e.clipboardData.items;
			if (!items) return;
			
			//access data directly
			for (var i = 0; i < items.length; i++) {
				if (items[i].type.indexOf("image") !== -1) {
					//image
					var blob = items[i].getAsFile();
					var URLObj = window.URL || window.webkitURL;
					var source = URLObj.createObjectURL(blob);
					this.create(source);

					setTimeout(this.findBackground.bind(this), 100);
				}
			}
			e.preventDefault();
		}
	};

	//draw pasted image to canvas
	this.create = function (source) {
		var pastedImage = image = new Image();
		pastedImage.onload = function () {
			//resize
			rawCanvas.width = pastedImage.width;
			rawCanvas.height = pastedImage.height;

			rawContext.drawImage(pastedImage, 0, 0);
		};
		pastedImage.src = source;
	};

	this.redrawImage = function () {
		if (image) {
			rawContext.drawImage(image, 0, 0);
		}
	}

	this.getPixel = function (x, y) {
		// Need to compare with == so ...
		var p = rawContext.getImageData(x, y, 1, 1).data;
		return (p[0] << 16) + (p[1] << 8) + p[2];
	}

	this.hasPixel = function(color, pixels, tolerance) {
		if (color in pixels) return color;

		tolerance = tolerance || 1;
		var base = color - (tolerance << 16) - (tolerance << 8) - tolerance;
		var bb = tolerance * 2
		var gg = bb << 8
		var rr = bb << 16
		for (var r = 0; r <= rr; r += 0x010000) {
			for (var g = 0; g <= gg; g += 0x0100) {
				for (var b = 0; b <= bb; b += 0x01) {
					if ((base + r + g + b) in pixels) {
						return (base + r + g + b);
					}
				}
			}
		}

		return null;
	}

	this.isPixel = function(color, pixel, tolerance) {
		if (color == pixel) return true;

		tolerance = tolerance || 1;
		var base = color - (tolerance << 16) - (tolerance << 8) - tolerance;
		var bb = tolerance * 2
		var gg = bb << 8
		var rr = bb << 16
		for (var r = 0; r <= rr; r += 0x010000) {
			for (var g = 0; g <= gg; g += 0x0100) {
				for (var b = 0; b <= bb; b += 0x01) {
					if ((base + r + g + b) == pixel) {
						return true;
					}
				}
			}
		}

		return false;
	}

	this.findGrid = function () {
		// Looking for 1 pixel thick lines of the same colour in a grid pattern.
		// It's possible for there to be pixels overlapping the grid, though!

		// It's 25 pixels from line to line (inclusive)
		// thus we should find the colour we want within 25 square pixels.
		var x, y, pixels = {}, intersection = {};

		for (y = 0; y < 25; ++y) {
			for (x = 0; x < 25; ++x) {
				var p = getCanvasPixel(rawContext, x, y);
				intersection[p] = true;
			}
		}

		for(let d of [
			[rawCanvas.width - 25, 0],
			[0, rawCanvas.height - 25],
			[rawCanvas.width - 25, rawCanvas.height - 25],
		]) {
			var pp = {};
			var xx = d[0], yy = d[1];
			for (y = 0; y < 25; ++y) {
				for (x = 0; x < 25; ++x) {
					var p = getCanvasPixel(rawContext, xx + x, yy + y);
					if (p=this.hasPixel(p, intersection)) {
						pp[p] = true;
					}
				}
			}
			
			// Eliminate things in intersection that are not in pp.
			for (let p in intersection) {
				if (!this.hasPixel(p, pp)) {
					delete intersection[p];
				}
			}
		}

		// Generally there should only be about 5~9 colours left in intersection at this point.
		// Going to cheat here... look for somewhere on the screen that has a + shape in these colours.
		// TODO: This may have trouble with sides of the inventory window.
		var positions = {}, bestGridPixels = {}, best = 0;
		for (y = 0; y < rawCanvas.height; ++y) {
			for (x = 0; x < rawCanvas.width; ++x) {
				var p = getCanvasPixel(rawContext, x, y);
				if (this.hasPixel(p, intersection)) {
					var score =
						!this.isPixel(getCanvasPixel(rawContext,   x - 1, y), p, 2)
						+ !this.isPixel(getCanvasPixel(rawContext, x + 1, y), p, 2)
						+  this.isPixel(getCanvasPixel(rawContext, x - 1, y + 1), p, 2)
						+  this.isPixel(getCanvasPixel(rawContext, x,     y + 1), p, 2)
						+  this.isPixel(getCanvasPixel(rawContext, x + 1, y + 1), p, 2)
						+ !this.isPixel(getCanvasPixel(rawContext, x - 1, y + 2), p, 2)
						+  this.isPixel(getCanvasPixel(rawContext, x,     y + 2), p, 2)
						+ !this.isPixel(getCanvasPixel(rawContext, x + 1, y + 2), p, 2);

					if (score > best) {
						best = score;
						bestGridPixels = {};
						bestGridPixels[p] = 1;
						positions = {}
						positions[p] = [x, y + 1];
					}
					else if (score == best) {
						var np;
						if (np=this.hasPixel(p, bestGridPixels)) {
							++bestGridPixels[np];
						}
						else {
							bestGridPixels[p] = 1;
							positions[p] = [x, y + 1];
						}
					}
				}
			}
		}

		best = 0;
		var bestGridPixel;
		for (let p in bestGridPixels) {
			var score = bestGridPixels[p];
			if (score > best) {
				bestGridPixel = p
			}
		}

		// If we're far out, we want to find the upper left-most portion of the grid.
		var position = positions[bestGridPixel];
		if (position[0] > 24 || position[1] > 24) {
			var x = position[0], y = position[1];
			// TODO: If someone screenshots outside of the inv window this might be a problem.
			if (x > 24) {
			var tx = x + 23, ty = y > 0 ? y - 1 : y + 1;
				while (tx > 24) {
					tx -= 24;
					if (this.isPixel(getCanvasPixel(rawContext, tx, ty), bestGridPixel, 2)) {
						// This pixel should not be similar unless it's at the edge.
						break;
					}
				}
				x = tx + 1;
			}

			if (y > 24) {
				tx = x > 0 ? x - 1 : x + 1; ty = y + 23;
				while (ty > 24) {
					ty -= 24;
					if (this.isPixel(getCanvasPixel(rawContext, tx, ty), bestGridPixel, 2)) {
						// This pixel should not be similar unless it's at the edge.
						break;
					}
				}
				y = ty + 1;
			}

			position = [x, y];
		}

		return position;
	}


	var cornerRects = [
		[0, 0, 1, 1],  [22, 0, 1, 1],
		[0, 22, 1, 1], [22, 22, 1, 1],
	];

	var boxRects = [
		[1, 0, 21, 1],
		[0, 1, 1, 21], [22, 1, 1, 21],
		[1, 22, 21, 1],
	];

	var shadowRects = [
		[1, 1, 21, 1],
		[1, 1, 1, 21],
	];

	var gridRects = [
		[23, 0, 1, 23],
		[0, 23, 24, 1],
	];
	
	var innerRect = [[2, 2, 20, 20]];

	this.preCrop = function () {
		var pos = this.findGrid();
		var left = pos[0], top = pos[1];
		var gridColor = getCanvasPixel(rawContext, left, top);
		
		// We ignore everything to the left of pos[0] and above pos[1].
		// We need to find the right-most and bottom-most grid position available.
		var tx, ty;
		var right, bottom;

		// Find right-most bit by scanning verts at 24 pixel intervals.
		for (tx = left + 24; tx < rawCanvas.width; tx += 24) {
			var found = false;
			for (ty = 0; ty < rawCanvas.height; ++ty) {
				if (this.isPixel(getCanvasPixel(rawContext, tx, ty), gridColor)) {
					right = tx;
					found = true;
					break;
				}
			}
			if (!found) break;
		}

		// Find bottom-most bit by scanning horz at 24 pixel intervals.
		for (ty = top + 24; ty < rawCanvas.height; ty += 24) {
			var found = false;
			for (tx = 0; tx < rawCanvas.width; ++tx) {
				if (this.isPixel(getCanvasPixel(rawContext, tx, ty), gridColor)) {
					bottom = ty;
					found = true;
					break;
				}
			}
			if (!found) break;
		}

		left += 1; top += 1;

		$("#left").val(left);
		$("#top").val(top);
		$("#right").val(right);
		$("#bottom").val(bottom);

		return gridColor;
	}

	this.crop = function () {
		var left = parseInt($("#left").val());
		var top = parseInt($("#top").val());
		var width = parseInt($("#right").val()) - left + 1;
		var height = parseInt($("#bottom").val()) - top + 1;

		var data = rawContext.getImageData(left, top, width, height);
		finalCanvas.width = width;
		finalCanvas.height = height;
		finalContext.putImageData(data, 0, 0);
	}

	this.findBackground = function () {
		var gridColor = this.preCrop();
		this.crop();

		// Besides the grid colour, there's four colours of importance.
		// The pattern is as so:
		// &*********************&G
		// *+++++++++++++++++++++*G
		// *+--------------------*G
		// *+--------------------*G
		// x 18 more
		// &*********************&G
		// GGGGGGGGGGGGGGGGGGGGGGGG

		// Check all expected positions for each.
		var totals = this.profileRects([
			[0, 0, 24, 24]
		]);

		this.saveColor("#grid-color", gridColor);
		this.profileRectsAndSave("#corner-color", cornerRects, totals);
		var boxColor = this.profileRectsAndSave("#box-color", boxRects, totals);
		var shadowColor = this.profileRectsAndSave("#shadow-color", shadowRects, totals);

		boxColor = getColorAsHex(boxColor);
		shadowColor = getColorAsHex(shadowColor);

		// Find inner colour.
		var profile = this.profileRects(innerRect);
		var minBoxDiff = 9001, minBoxColor, minShadowDiff = 9001, minShadowColor;
		for (let color in profile) {
			var hex = getColorAsHex(color);
			var boxDiff = chromatism.difference(hex, boxColor);
			var shadowDiff = chromatism.difference(hex, shadowColor);
			
			if (boxDiff < minBoxDiff) {
				minBoxDiff = boxDiff;
				minBoxColor = color;
			}

			if (shadowDiff < minShadowDiff) {
				minShadowDiff = shadowDiff;
				minShadowColor = color;
			}
		}
		minBoxColor = parseInt(minBoxColor)
		minShadowColor = parseInt(minShadowColor)

		if (minBoxColor != minShadowColor) {
			console.log("Colors with minimum distance from box and shadow colors are different!",
				"Box's:", getColorAsHex(minBoxColor), "Shadow's:", getColorAsHex(minShadowColor));
		}

		this.saveColor("#inner-color", minBoxColor);

		this.cleanIcon();
	}

	this.cleanIcon = function () {
		this.crop();

		this.hideRectsIf(gridRects, $("#grid-color").data("best"));
		this.hideRectsIf(cornerRects, $("#corner-color").data("best"));
		this.hideRectsIf(boxRects, $("#box-color").data("best"));
		this.hideRectsIf(shadowRects, $("#shadow-color").data("best"));
		this.hideRectsIf(innerRect, $("#inner-color").data("best"));
	}


	this.profileRects = function (rects, canvas) {
		var data = {}
		for (var y = 0; y < finalCanvas.height; y += 24) {
			for (var x = 0; x < finalCanvas.width; x += 24) {
				for (let rect of rects) {
					var pixels = finalContext.getImageData(x + rect[0], y + rect[1], rect[2], rect[3]).data;

					for (var p = 0; p < pixels.length; p += 4) {
						var color = (pixels[p] << 16) + (pixels[p + 1] << 8) + pixels[p + 2], cc;

						if ((cc = this.hasPixel(color, data)) != null) {
							++data[cc];
						}
						else {
							data[color] = 1;
						}
					}
				}
			}
		}

		return data;
	}

	this.hideRectsIf = function (rects, erase) {
		for (var y = 0; y < finalCanvas.height; y += 24) {
			for (var x = 0; x < finalCanvas.width; x += 24) {
				for (let rect of rects) {
					var destX = x + rect[0], destY = y + rect[1];
					var width = rect[2], height = rect[3];
					var pixels = finalContext.getImageData(destX, destY, width, height);
					var data = pixels.data;

					for (var p = 0; p < data.length; p += 4) {
						var color = (data[p] << 16) + (data[p + 1] << 8) + data[p + 2];

						if (this.isPixel(color, erase)) {
							data[p + 3] = 0;
						}
					}

					finalContext.putImageData(pixels, destX, destY);
				}
			}
		}
	}

	this.profileRectsAndSave = function (selector, rects, totals) {
		var profile = this.profileRects(rects);

		var others = [];
		var best = finalCanvas.width * finalCanvas.height, bestColor;
		for (var x in profile) {
			others.push(parseInt(x));

			var score = totals[x] - profile[x];
			if (score < best) {
				best = score;
				bestColor = x;
			}
		}

		bestColor = parseInt(bestColor);
		this.saveColor(selector, bestColor, others);
		return bestColor;
	}

	this.saveColor = function (selector, bestColor, others) {
		var $elem = $(selector);
		$elem.data("best", bestColor);
		$elem.css("background-color", getColorAsHex(bestColor));

		if (others) {
			$elem.data("selection", others);
		}
	}
}

function getColorAsHex(color) {
	return "#" + ("00000" + parseInt(color).toString(16)).substr(-6);
}

// From https://stackoverflow.com/a/20452240/734170
function scaleImageData(ctx, imageData, scale) {
	var scaled = ctx.createImageData(imageData.width * scale, imageData.height * scale);
	var subLine = ctx.createImageData(scale, 1).data
	for (var row = 0; row < imageData.height; row++) {
		for (var col = 0; col < imageData.width; col++) {
			var sourcePixel = imageData.data.subarray(
				(row * imageData.width + col) * 4,
				(row * imageData.width + col) * 4 + 4
			);
			for (var x = 0; x < scale; x++) subLine.set(sourcePixel, x*4)
			for (var y = 0; y < scale; y++) {
				var destRow = row * scale + y;
				var destCol = col * scale;
				scaled.data.set(subLine, (destRow * scaled.width + destCol) * 4)
			}
		}
	}

	return scaled;
}

function getCanvasPixel(ctx, x, y) {
	var p = ctx.getImageData(x, y, 1, 1).data;
	return (p[0] << 16) + (p[1] << 8) + p[2];
}
