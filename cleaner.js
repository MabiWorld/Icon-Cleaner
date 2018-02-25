var IMAGE_PROXY_URL = "https://mabi.world/icon/image_proxy.php";

// Adapted from https://stackoverflow.com/a/18387322/734170
$(function () {
	var CLIPBOARD = new CLIPBOARD_CLASS("#cleaner", "#cleaned", "#editor", "#editor-buttons");

	$(".show-corrections").click(function () {
		if ($(".corrections").toggle().is(":visible")) {
			$(this).text("Hide corrections pane...");
		}
		else {
			$(this).text("Make corrections...");
		}
	});

	$("#grid-adjuster").click(function (e) {
		CLIPBOARD.beginGridFinder();
		e.stopPropagation();
	});

	$(".slot-selector").click(function () {
		CLIPBOARD.beginSlotSelector();
	});

	$(".positions input").change(function () {
		CLIPBOARD.findBackground();
		CLIPBOARD.cleanIcon();
	});

	$(".commit-colors").click(function () {
		$(".selection").data("manual", true);
	});

	$("body").click(function () {
		$("#color-selector").hide();
	});

	function makeSelector($sel, $elem) {
		// Select any colour from image.
		var cleanCanvas = $elem.hasClass("normal") ? CLIPBOARD.finalCanvas : CLIPBOARD.rawCanvas;
		cleanCanvas.redraw();

		var selCanvas, $selCanvas = $("<canvas>").attr({
			"width": cleanCanvas.width() * 4,
			"height": cleanCanvas.height() * 4,
		}).click(function (e) {
			var offset = $(this).offset();
			var x = e.pageX - offset.left;
			var y = e.pageY - offset.top;

			var pixel = selCanvas.getPixel(x, y);
			$elem.data({
				"best": pixel,
				"manual": true,
			})
			.css("background-color", getColorAsHex(pixel));

			$sel.hide();
			if ($elem.hasClass("normal")) {
				CLIPBOARD.cleanIcon();
			}
			else {
				CLIPBOARD.findBackground();
			}
		})
		.mousemove(function (e) {
			var offset = $(this).offset();
			var x = e.pageX - offset.left;
			var y = e.pageY - offset.top;
			var pixel = getColorAsHex(selCanvas.getPixel(x, y));
			
			$(".color-preview")
				.css({
					"background-color": pixel,
					"color": chromatism.contrastRatio(pixel).hex,
				})
				.text(pixel);
		})
		.appendTo($sel);

		selCanvas = new CANVAS($selCanvas);

		var image = cleanCanvas.context.getImageData(0, 0, cleanCanvas.width(), cleanCanvas.height())

		selCtx = selCanvas.context;
		selCtx.putImageData(scaleImageData(selCtx, image, 4), 0, 0);

		// Add hex code view.
		var color = $elem.data("best");
		$("<div>").addClass("color-preview")
			.text(color ? getColorAsHex(color) : "<none>")
			.appendTo($sel);
	}

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
			var $div = $("<div>").addClass("selections").appendTo($sel);
			var $template = $("<span>").addClass("selection");
			for (let c of selection) {
				$template.clone()
					.data({
						"best": c,
						"manual": true,
					})
					.css("background-color", getColorAsHex(c))
					.click(function () {
						var col = $(this).data("best");
						$this.data("best", col)
							.css("background-color", getColorAsHex(col));
						
						$sel.hide();
						CLIPBOARD.cleanIcon();
					})
					.mouseover(function () {
						$(".color-preview").text(
							getColorAsHex($(this).data("best"))
						);
					})
					.appendTo($div);
			}

			// Add hex code view.
			var current = $this.data("best");
			$("<div>").addClass("color-preview")
				.text(current ? getColorAsHex(current) : "<none>")
				.appendTo($sel);

			// Add open general color select button.
			$("<div>").addClass("button")
				.text("Selector...")
				.click(function (e) {
					makeSelector($sel.empty(), $this);

					e.stopPropagation();
				})
				.appendTo($sel);
		}
		else {
			makeSelector($sel, $this);
		}

		var offset = $this.offset();
		$sel.css({
			"left": offset.left,
			"top": offset.top + $this.outerHeight(),
		}).show();

		e.stopPropagation();
	})

	$(".color-help").mouseover(function () {
		var $this = $(this);
		var offset = $this.offset();

		var $img = $('<img src="img/colors_help.png"/>');

		$("#color-selector").empty()
		.append($img)
		.show()
		.css({
			"left": offset.left - 200 + $this.outerWidth(),
			"top": offset.top + $this.outerHeight(),
		});
	})
	.mouseout(function () {
		$("#color-selector").hide();
	});

	$(".interface-preview").mouseover(function () {
		var $this = $(this);
		var offset = $this.offset();

		var img = $this.attr("class").replace("interface-preview", "").trim().replace(/-/g, "_");
		var $img = $('<img src="img/interfaces/' + img + '.png"/>');

		$("#interface-previewer").empty()
		.append($img)
		.show()
		.css({
			"left": offset.left,
			"top": offset.top + $this.outerHeight(),
		});
	})
	.mouseout(function () {
		$("#interface-previewer").hide();
	});

	if (location.search) {
		var params = location.search.substr(1).split("&");

		for (let param of params) {
			var splits = param.split("=");
			
			if (splits[0] == "name") {
				$("#upload-name").val(splits.slice(1).join("="));
			}
		}
	}
});

/**
 * image pasting into canvas
 * 
 * @param {string} rawCanvas - selector for raw pasted image
 * @param {string} finalCanvas - selector for cleaned image
 */
function CLIPBOARD_CLASS(rawCanvas, finalCanvas, editorCanvas, editorButtons) {
	var _self = this;
	rawCanvas = this.rawCanvas = new CANVAS(rawCanvas);
	finalCanvas = this.finalCanvas = new CANVAS(finalCanvas);
	editorCanvas = this.editorCanvas = new CANVAS(editorCanvas);

	//handlers
	var findingGrid = false;
	var selectingFirstSlot = false, selectingLastSlot = false;
	$(rawCanvas.canvas).mousemove(function (e) {
		var offset = $(this).offset();
		var x = e.pageX - offset.left;
		var y = e.pageY - offset.top;

		if (findingGrid) {
			_self.drawGridFinder(x, y);
		}
		else if (selectingFirstSlot || selectingLastSlot) {
			_self.drawSlotSelector(x, y);
		}
	})
	.click(function (e) {
		var offset = $(this).offset();
		var x = e.pageX - offset.left;
		var y = e.pageY - offset.top;

		if (findingGrid) {
			_self.endGridFinder(x, y);
		}
		else if (selectingFirstSlot) {
			_self.selectFirstSlot(x, y);
		}
		else if (selectingLastSlot) {
			_self.selectLastSlot(x, y);
		}
	});

	var editorHasData = false, editorTool = 0, toolInUse = false;
	$(editorCanvas.canvas).mousemove(function (e) {
		if (!editorHasData || !editorTool) return;

		var offset = $(this).offset();
		var x = e.pageX - offset.left;
		var y = e.pageY - offset.top;

		if (toolInUse) {
			_self.selectEditorPixel(x, y);
		}

		_self.hoverEditorPixel(x, y);
	})
	.mousedown(function (e) {
		if (!editorHasData || !editorTool) return;

		var offset = $(this).offset();
		var x = e.pageX - offset.left;
		var y = e.pageY - offset.top;

		toolInUse = true;
		_self.selectEditorPixel(x, y);
	})
	.mouseup(function () {
		toolInUse = false;
	})
	.mouseout(function () {
		toolInUse = false;
	});

	$(editorButtons + " .pencil").click(function () {
		editorTool = 1;

		$(editorButtons + " .selected").removeClass("selected");
		$(this).addClass("selected");
	});

	$(editorButtons + " .eraser").click(function () {
		editorTool = 2;

		$(editorButtons + " .selected").removeClass("selected");
		$(this).addClass("selected");
	});

	$(editorButtons + " .refresh").click(function () {
		_self.cleanIcon();
	});

	$(editorButtons + " .cycle").click(function () {
		_self.cycleEditorBackground();
	});

	$(editorButtons + " .upload").click(function () {
		_self.uploadIcon();
	});

	document.addEventListener('paste', function (e) { _self.paste_auto(e); }, false);

	//on paste
	this.paste_auto = function (e) {
		if (e.clipboardData) {
			var items = e.clipboardData.items;
			if (!items) return;
			
			//access data directly
			for (var i = 0; i < items.length; i++) {
				if (items[i].type.indexOf("image") != -1) {
					//image
					this.pasteData(items[i].getAsFile());
				}
				else if (items[i].type.indexOf("text/plain") !== -1) {
					items[i].getAsString(function (link) {
						if (link.match(/^https?:\/\//)) {
							setStatus('<img src="img/loading.gif">');

							$.ajax({
								"url": IMAGE_PROXY_URL,
								"method": "GET",
								"data": { "url": link },
								// https://stackoverflow.com/a/24719409/734170
								"xhr": function() {
									var xhr = jQuery.ajaxSettings.xhr();

									var setRequestHeader = xhr.setRequestHeader;
									xhr.setRequestHeader = function(name, value) {
										if (name == 'X-Requested-With') return;

										setRequestHeader.call(this, name, value);
									}

									xhr.responseType = "blob";

									return xhr;
								},
								"success": function (data) {
									setStatus("Fetched image from URL successfully", "success");
									_self.pasteData(data);
								},
								"error": function (xhr, status, error) {
									setStatus("Unable to fetch image from URL: " + link, "error");
									console.error(status, error);
								},
							})
						}
						else {
							setStatus("Text paste not a URL.", "error");
						}
					});
				}
				else {
					setStatus("Unknown paste type: " + items[i].type, "error");
				}
			}
			e.preventDefault();
		}
	};

	this.pasteData = function (blob) {
		if (blob.type.indexOf("image/png") == -1) {
			setStatus("Policy requires that images be of type PNG.", "warning")
		}

		var URLObj = window.URL || window.webkitURL;
		var source = URLObj.createObjectURL(blob);
		rawCanvas.create(source);

		// Blank the position information.
		$("#left").val("");
		$("#top").val("");
		$("#right").val("");
		$("#bottom").val("");

		setTimeout(this.cleanIcon.bind(this), 100);
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

		var grids = new COLORBIN(), gridList = [];
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
					"color": c,
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

					grids[cc].push(r);
					gridList.push(r);
				}
				else {
					grids[c] = [r];
					gridList.push(r);
				}
			}
		}

		// Sort the possibilities by searches found.
		gridList.sort(
			(a, b) => b.searches - a.searches
		);

		var best;
		for (let grid of gridList) {
			if (best=this.isGrid(pixels, grid.color)) {
				setGridPosition(best);
				break;
			}
		}

		return best ? best.color : undefined;
	}

	this.isGrid = function (pixels, color) {
		var hex = getColorAsHex(color);
		var height = pixels.length, width = pixels[0].length;

		var tol = parseInt($("#tolerance").val()) || 40;

		// Profile the color along the verticals.
		var cols = new Array(width);
		for (let x = 0; x < width; ++x) {
			let col = 0;
			for (let y = 0; y < height; ++y) {
				if (chromatism.difference(getColorAsHex(pixels[y][x]), hex) < tol) {
					++col;
				}
			}
			cols[x] = col;
		}

		// Categorize the columns...
		var breaks = jenks(cols, 3), colClasses = "";
		for (let c = 0; c < width; ++c) {
			var col = cols[c];

			for (let b = 1; b <= 3; ++b) {
				if (col <= breaks[b]) {
					colClasses += b.toString();
					break;
				}
			}
		}

		var mo, result = { "color": color };
		if (
			// Does this include past the left edge of the inventory window? (and possibly the right?)
			(mo=colClasses.match(/^(1+3+)((2{23}3)+)(3+1*|2*)$/))
			// or does this include past the right edge of the inventory window? (and possibly include [some of] the left edge?)
			|| (mo=colClasses.match(/^(1*3+|2*3)((2{23}3)+)3+1+$/))
			// or does this include [some of] the left edge of the inventory window? (and possibly [some of] the right?)
			|| (mo=colClasses.match(/^(3+)((1{23}[23])+)(3+|1*)$/))
			// or does this only include [some of] the right edge of the inventory window, if any edge?
			|| (mo=colClasses.match(/^(1*[23])((1{23}[23])+)(3+|1*)$/))
			|| (mo=colClasses.match(/^([12]*3)(([12]{23}3)+)(3+|[12]*)$/))
		) {
			result.left = mo[1].length;
			result.right = result.left + mo[2].length - 1; // TODO: off by 1?
		}
		else {
			return null;
		}

		// Shortcut to finding if there's a top/bottom edge present.
		// If not, it still finds the bottom and top of the grid.
		var x = result.left;
		var top = 0, bottom = 0, bottomEnd = false;
		for (let y = height - 1; y >= 0; --y) {
			if (chromatism.difference(getColorAsHex(pixels[y][x]), hex) < tol) {
				if (bottomEnd) {
					++top;
				}
				else {
					++bottom;
				}
			}
			else if (top) {
				result.top = y + top + 1;
				if (top > 1) {
					top = 0;
					break;
				}
				top = 0;
			}
			else if (bottom) {
				bottomEnd = true;
				result.bottom = y + 1;
				bottom = 0;
			}
		}

		if (top) {
			// In the event we ended midway through the top edge.
			result.top = top;
		}

		return result;
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
		var gridColor = $("#grid-color").data("best");
		
		if (!gridColor) {
			gridColor = this.findGrid();
		}
		else {
			rawCanvas.search()
			var grid = this.isGrid(rawCanvas.pixels, gridColor);
			if (!grid && !$("#grid-color").data("manual")) {
				gridColor = this.findGrid();
			}
			else if (grid) {
				// Only set if they're not already set...
				setGridPosition(grid, true);
			}
			else {
				console.warn("Unable to find manually set grid color. Resetting...");
				gridColor = this.findGrid();
			}
		}

		if (!gridColor) {
			console.warn("Grid color could not be found!!");
			return;
		}

		var left = parseInt($("#left").val());
		var top = parseInt($("#top").val());
		var right = parseInt($("#right").val());
		var bottom = parseInt($("#bottom").val());

		finalCanvas.crop(rawCanvas, left, top, right, bottom);

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
	}

	this.cleanIcon = function (recursed) {
		// Ensure we have everything needed...
		var gridColor = $("#grid-color").data("best");
		var cornerColor = $("#corner-color").data("best");
		var boxColor = $("#box-color").data("best");
		var shadowColor = $("#shadow-color").data("best");
		var innerColor = $("#inner-color").data("best");

		var left = parseInt($("#left").val());
		var top = parseInt($("#top").val());
		var right = parseInt($("#right").val());
		var bottom = parseInt($("#bottom").val());

		if (
			!gridColor || !cornerColor || !boxColor || !shadowColor || !innerColor
			|| isNaN(left) || isNaN(top) || isNaN(right) || isNaN(bottom)
		) {
			this.findBackground();

			if (!recursed) return this.cleanIcon(true);

			var show = false, error = "";

			if (!gridColor || isNaN(left) || isNaN(top)) {
				show = true;
				error = "<div>Please adjust the grid.</div>";
			}
			else if (isNaN(right) || isNaN(bottom)) {
				error = "<div>Please select the icon slots.</div>";
			}
			else {
				show = true;
				
				var colors = [];
				if (!cornerColor) colors.push("Corner");
				if (!boxColor)    colors.push("Box");
				if (!shadowColor) colors.push("Shadow");
				if (!innerColor)  colors.push("Inner");

				if (colors.length == 1) {
					error = "<div>Please manually set the " + colors[0] + " color.</div>";
				}
				else if (colors.length > 1) {
					error = "<div>Please manually set the following colors: " + colors.join(", ") + ".</div>";
				}
			}

			setStatus(error, "error");
			if (show && $(".corrections").is(":hidden")) {
				$(".show-corrections").click();
			}
			return;
		}

		setStatus();

		var tol = parseInt($("#tolerance").val()) || 40;

		// Draw the cropped base.
		finalCanvas.crop(rawCanvas, left, top, right, bottom);

		// Perform cleaning.
		finalCanvas.hideRectsIf(gridRects, gridColor, tol);
		finalCanvas.hideRectsIf(cornerRects, cornerColor, tol);
		finalCanvas.hideRectsIf(boxRects, boxColor, tol);
		finalCanvas.hideRectsIf(shadowRects, shadowColor, tol);
		finalCanvas.hideRectsIf(innerRect, innerColor, tol);

		setTimeout(this.loadInEditor.bind(this), 100);
	}

	this.profileRectsAndSave = function (selector, rects, totals) {
		var profile = finalCanvas.profileRects(rects);

		var manual = $(selector).data("manual");
		var bestColor, bestHex;
		if (manual) {
			bestColor = $(selector).data("best");
			bestHex = getColorAsHex(bestColor);
		}

		var others = [];
		var best = manual ? 100 : finalCanvas.width() * finalCanvas.height();
		for (var x in profile) {
			x = parseInt(x);
			others.push(x);

			var score;
			if (manual) {
				score = chromatism.difference(getColorAsHex(x), bestHex);
			}
			else {
				score = totals[x] - profile[x];
			}

			if (score < best) {
				best = score;
				bestColor = x;
			}
		}

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
		else {
			$elem.data("selection", false);
		}
	}

	var gridZoomer;
	this.beginGridFinder = function () {
		findingGrid = true;

		var gridZoom = $("<canvas>")[0];
		gridZoom.width = gridZoom.height = 24 * 4;

		gridZoomer = gridZoom.getContext("2d");

		var $relTo = $(rawCanvas.canvas);
		var offset = $relTo.offset();

		$("#color-selector").empty().show()
			.css({
				"left": offset.left,
				"top": offset.top + $relTo.outerHeight(),
			})
			.append(gridZoom)
			.append('<div id="color-under-cursor" class="color-preview"></div>');
	}

	this.drawGridFinder = function (x, y) {
		rawCanvas.redraw();

		x = Math.floor(x);
		y = Math.floor(y);

		var pixel = rawCanvas.getPixel(x, y);

		// Vertical line
		rawCanvas.drawLine(x + 0.5, 0, x + 0.5, rawCanvas.height(), "#f00");

		// Horizontal line
		rawCanvas.drawLine(0, y + 0.5, rawCanvas.width(), y + 0.5, "#f00");

		// Copy to zoomer.
		var image = rawCanvas.context.getImageData(x - 12, y - 12, 24, 24)
		gridZoomer.putImageData(scaleImageData(gridZoomer, image, 4), 0, 0);

		var hex = getColorAsHex(pixel);
		$("#color-under-cursor")
			.text(hex)
			.css({
				"background-color": hex,
				"color": chromatism.contrastRatio(hex).hex,
			});
		$("#grid-color").css("background-color", hex);

		$("#left").val(x);
		$("#top").val(y);
	}

	this.endGridFinder = function (x, y) {
		findingGrid = false;
		rawCanvas.redraw();

		x = Math.floor(x);
		y = Math.floor(y);

		var pixel = rawCanvas.getPixel(x, y);

		$("#left").val(x + 1);
		$("#top").val(y + 1).change();

		$("#color-under-cursor").text("");
		$("#grid-color").data({
			"best": pixel,
			"manual": true,
		}).css("background-color", getColorAsHex(pixel));

		$("#color-selector").empty().hide();
	}

	this.beginSlotSelector = function () {
		var left = parseInt($("#left").val());
		var top = parseInt($("#top").val());

		if (isNaN(left) || isNaN(top)) {
			console.warn("Tried to select slots when grid hasn't been found.");
		}
		else {
			selectingFirstSlot = true;
			selectingLastSlot = false;
		}
	}

	this.drawSlotSelector = function (x, y) {
		rawCanvas.redraw();

		x = Math.floor(x);
		y = Math.floor(y);

		var left = parseInt($("#left").val());
		var top = parseInt($("#top").val());

		if (x >= left % 24 && y >= top % 24) {
			var rectLeft, rectTop, rectRight, rectBottom;

			if (selectingFirstSlot) {
				rectLeft = roundToGrid(left, x) - 1;
				rectTop = roundToGrid(top, y) - 1;
				rectRight = rectLeft + 25;
				rectBottom = rectTop + 25;
			}
			else {
				rectLeft = left - 1;
				rectTop = top - 1;
				rectRight = roundToGrid(left, x) + 24;
				rectBottom = roundToGrid(top, y) + 24;
			}

			// Draw bounding box.
			rawCanvas.drawOutline(rectLeft, rectTop, rectRight, rectBottom, "#f00");
		}
	}

	this.selectFirstSlot = function (x, y) {
		selectingFirstSlot = false;
		selectingLastSlot = true;

		var $left = $("#left"), $top = $("#top");
		var left = parseInt($left.val());
		var top = parseInt($top.val());

		left = roundToGrid(left, x);
		top = roundToGrid(top, y);

		$left.val(left);
		$top.val(top);
	}

	this.selectLastSlot = function (x, y) {
		selectingFirstSlot = false;
		selectingLastSlot = false;

		rawCanvas.redraw();

		var $left = $("#left"), $top = $("#top");
		var left = parseInt($left.val());
		var top = parseInt($top.val());

		var right = roundToGrid(left, x) + 23;
		var bottom = roundToGrid(top, y) + 23;

		$("#right").val(right);
		$("#bottom").val(bottom).change();
	}

	/* EDITOR FUNCTIONS */
	var editorImage = null;
	this.loadInEditor = function () {
		var width = finalCanvas.width();
		var height = finalCanvas.height();
		editorImage = finalCanvas.context.getImageData(0, 0, width, height)

		editorCanvas.width(width * 4 + 2);
		editorCanvas.height(height * 4 + 2);

		editorHasData = true;
		this.refreshEditor();
	}

	this.refreshEditor = function () {
		if (!editorHasData) return;

		selCtx = editorCanvas.context;
		selCtx.putImageData(scaleImageData(selCtx, editorImage, 4), 1, 1);

		var width = editorCanvas.width();
		var height = editorCanvas.height();
		editorCanvas.drawOutline(0, 0, width, height, "#fff");
	}

	this.hoverEditorPixel = function (x, y) {
		var left = Math.min(Math.max(0, Math.floor((x - 1) / 4) * 4), editorCanvas.width() - 6);
		var top = Math.min(Math.max(0, Math.floor((y - 1) / 4) * 4), editorCanvas.height() - 6);
		var right = left + 5;
		var bottom = top + 5;

		this.refreshEditor();
		editorCanvas.drawOutline(left, top, right, bottom, "#f00");
	}

	this.selectEditorPixel = function (x, y) {
		x = Math.min(Math.max(0, Math.floor((x - 1) / 4)), finalCanvas.width() - 1);
		y = Math.min(Math.max(0, Math.floor((y - 1) / 4)), finalCanvas.height() - 1);

		var finalContext = finalCanvas.context;
		var editorContext = editorCanvas.context;

		var pixel = rawCanvas.context.getImageData(
			x + parseInt($("#left").val()),
			y + parseInt($("#top").val()),
			1, 1);

		switch (editorTool) {
			case 0: return;
			case 1:
				// Restore pixel.
				pixel.data[3] = 255;
				finalContext.putImageData(pixel, x, y);
				break;
			case 2:
				// Hide pixel.
				pixel.data[3] = 0;
				finalContext.putImageData(pixel, x, y);
				break;
			//
		}

		this.loadInEditor();
	}

	var colorCycle = ["transparent", "#fff", "#f00", "#0f0", "#00f", "#000"];
	this.cycleEditorBackground = function () {
		$bg = $(".editor-bg");
		var cycle = (($bg.data("cycle") || 0) + 1) % colorCycle.length;
		$bg.css("background-color", colorCycle[cycle]);
		$bg.data("cycle", cycle);
	}

	/* Uploader */
	this.uploadIcon = function () {
		if (!editorHasData || !LOGGED_IN) return;

		var filename = $("#upload-name").val();

		if (filename) {
			if (!finalCanvas.canvas.toBlob){
				var dataURL = finalCanvas.canvas.toDataURL("image/png");
				var bytes = atob(dataURL.split(',')[1])
				var arr = new Uint8Array(bytes.length);
				for(var i=0; i<bytes.length; i++){
				   arr[i]=bytes.charCodeAt(i);
				}
				uploadImage(filename, new Blob([arr], {type:'image/png'}));
			}
			else {
				finalCanvas.canvas.toBlob(uploadImage.bind(null, filename));
			}
		}
	}
}

function getColorAsHex(color) {
	return "#" + ("00000" + parseInt(color).toString(16)).substr(-6);
}

function roundToGrid(gridPos, mousePos) {
	return gridPos + Math.floor((mousePos - gridPos) / 24) * 24;
}

function setGridPosition(pos, ifUnset) {
	var $left = $("#left"), $top = $("#top");
	var $right = $("#right"), $bottom = $("#bottom");

	if (ifUnset) {
		if (!$left.val()) $left.val(pos.left);
		if (!$top.val()) $top.val(pos.top);
		if (!$right.val()) $right.val(pos.right);
		if (!$bottom.val()) $bottom.val(pos.bottom);
	}
	else {
		$left.val(pos.left);
		$top.val(pos.top);
		$right.val(pos.right);
		$bottom.val(pos.bottom);
	}
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
