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
			var cleanCanvas = CLIPBOARD.finalCanvas;
			cleanCanvas.redraw();

			var selCanvas, $selCanvas = $("<canvas>").attr({
				"width": cleanCanvas.width() * 2,
				"height": cleanCanvas.height() * 2,
			}).click(function (e) {
				var offset = $(this).offset();
				var x = e.pageX - offset.left;
				var y = e.pageY - offset.top;

				var pixel = cleanCanvas.getPixel(x, y);
				$this.data("best", pixel)
					.css("background-color", getColorAsHex(pixel));

				$sel.hide();
				CLIPBOARD.cleanIcon();
			}).appendTo($sel);

			selCanvas = new CANVAS($selCanvas);

			var image = cleanCanvas.context.getImageData(0, 0, cleanCanvas.width(), cleanCanvas.height())

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
	var rawCanvas = this.rawCanvas = new CANVAS(rawCanvas);
	var finalCanvas = this.finalCanvas = new CANVAS(finalCanvas);

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
					rawCanvas.create(source);

					setTimeout(this.findBackground.bind(this), 100);
				}
			}
			e.preventDefault();
		}
	};

	this.findGrid = function () {
		var searches = rawCanvas.search([
			// Upper-left inside corner of inventory pane.
			[
				["x", "x", "x",  "x"],
				["x", "x", "x",  "x"],
				["x", "x", "!x", "!x"],
				["x", "x", "!x", "!x"],
			],
			// Upper inside piece of inventory pane.
			[
				["x", "x", "x",],
				["x", "x", "x",],
				["!x", "x", "!x"],
			],
			// Left inside piece of inventory pane.
			[
				["x", "x", "!x",],
				["x", "x", "x",],
				["x", "x", "!x"],
			],
			// Plus shaped, between four cells.
			[
				["!x", "x", "!x"],
				["x",  "x", "x"],
				["!x", "x", "!x"],
			],
		], 2);

		var pixels = rawCanvas.pixels;
		var width = rawCanvas.width(), height = rawCanvas.height();

		var grids = new COLORBIN();
		var maxDiscovered = 0, maxColor, maxPos;
		for (let results of searches) {
			for (let result of results) {
				// For each result we want to look along the axes in 24 pixel intervals.
				var x = result.pos[0], y = result.pos[1];
				var c = result.vars.x, cc;

				var r = {
					"left": x,
					"top": y,
					"right": x,
					"bottom": y,
					"searches": 1,
					"discoveries": 0,
				}

				if ((cc=grids.hasPixel(c, 2)) != null) {
					var skip = false;
					for (let tmp of grids[cc]) {
						if (tmp.left % 24 == x % 24 && tmp.top % 24 == y % 24) {
							// This has been accounted for.
							++tmp.searches;
							skip = true;
							break;
						}
					}

					if (skip) continue;

					grids[c].push(r);
				}
				else {
					grids[c] = [r];
				}

				// Count all pixels on axes. TODO: Must also count pixels on inv edges.
				// [Should not appear here (much)] [Sequential edge bit] [Inside edge, sequential to left, % 24 == to grid lines] [grid line ever 24px]
				// Rotate the above semantics based on edge we're on.

				var discovered = 0;
				for (var lx = x - 24; lx > 0; lx -= 24) {
					var found = false;
					for (var ly = 0; ly < height; ++ly) {
						if (COLORBIN.isPixel(pixels[ly][lx], c)) {
							++discovered;
							found = true;
						}
					}

					if (!found) break;

					// TODO: keep going if we don't enounter something.
					// If we encounter more afterwards, it's suspicious
				}

				lx += 24;
				if (lx < r.left) r.left = lx;

				for (var lx = x + 24; lx < width; lx += 24) {
					var found = false;
					for (var ly = 0; ly < height; ++ly) {
						if (COLORBIN.isPixel(pixels[ly][lx], c)) {
							++discovered;
							found = true;
						}
					}

					if (!found) break;

					// TODO: keep going if we don't enounter something.
					// If we encounter more afterwards, it's suspicious
				}

				lx -= 24;
				if (lx > r.right) r.right = lx;
				
				for (var ly = y - 24; ly > 0; ly -= 24) {
					var found = false;
					var pp = pixels[ly];
					for (var lx = 0; lx < width; ++lx) {
						if (COLORBIN.isPixel(pp[lx], c)) {
							++discovered;
							found = true;
						}
					}

					if (!found) break;

					// TODO: keep going if we don't enounter something.
					// If we encounter more afterwards, it's suspicious
				}

				ly += 24;
				if (ly < r.top) r.top = ly;
				
				for (var ly = y + 24; ly < height; ly += 24) {
					var found = false;
					var pp = pixels[ly];
					for (var lx = 0; lx < width; ++lx) {
						if (COLORBIN.isPixel(pp[lx], c)) {
							++discovered;
							found = true;
						}
					}

					if (!found) break;

					// TODO: keep going if we don't enounter something.
					// If we encounter more afterwards, it's suspicious
				}

				ly -= 24;
				if (ly > r.bottom) r.bottom = ly;

				r.discoveries = discovered;
			}
		}

		var bestScore = 0, best, bestColor;
		for (let c in grids) {
			for (let gridc of grids[c]) {
				var score = gridc.searches;

				if (score > bestScore) {
					bestScore = score;
					best = gridc;
					bestColor = c;
				}
			}
		}

		// Exclude the grid line on the left and top. Include on right and bottom.
		$("#left").val(best.left + 2);
		$("#top").val(best.top + 2);
		$("#right").val(best.right + 1);
		$("#bottom").val(best.bottom + 1);

		return bestColor;
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

	this.findBackground = function () {
		var gridColor = this.findGrid();
		finalCanvas.crop(rawCanvas);

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
		var totals = finalCanvas.profileRects([
			[0, 0, 24, 24]
		]);

		this.saveColor("#grid-color", gridColor);
		this.profileRectsAndSave("#corner-color", cornerRects, totals);
		var boxColor = this.profileRectsAndSave("#box-color", boxRects, totals);
		var shadowColor = this.profileRectsAndSave("#shadow-color", shadowRects, totals);

		boxColor = getColorAsHex(boxColor);
		shadowColor = getColorAsHex(shadowColor);

		// Find inner colour.
		var profile = finalCanvas.profileRects(innerRect);
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
		finalCanvas.redraw();

		finalCanvas.hideRectsIf(gridRects, $("#grid-color").data("best"));
		finalCanvas.hideRectsIf(cornerRects, $("#corner-color").data("best"));
		finalCanvas.hideRectsIf(boxRects, $("#box-color").data("best"));
		finalCanvas.hideRectsIf(shadowRects, $("#shadow-color").data("best"));
		finalCanvas.hideRectsIf(innerRect, $("#inner-color").data("best"));
	}

	this.profileRectsAndSave = function (selector, rects, totals) {
		var profile = finalCanvas.profileRects(rects);

		var others = [];
		var best = finalCanvas.width() * finalCanvas.height(), bestColor;
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
