/**
 * a bin of colors as keys and whatever
 * 
 * @param {object} base - optional base to copy from
 */
var COLORBIN = function (base) {
	if (base) {
		for (var k in base) {
			this[k] = base[x];
		}
	}
}

PUBLIC(COLORBIN, "hasPixel", function (color, tolerance) {
	if (color in this) return color;

	tolerance = tolerance || 1;
	var base = color - (tolerance << 16) - (tolerance << 8) - tolerance;
	var bb = tolerance * 2
	var gg = bb << 8
	var rr = bb << 16
	for (var r = 0; r <= rr; r += 0x010000) {
		for (var g = 0; g <= gg; g += 0x0100) {
			for (var b = 0; b <= bb; b += 0x01) {
				if ((base + r + g + b) in this) {
					return (base + r + g + b);
				}
			}
		}
	}

	return null;
});

STATIC(COLORBIN, "isPixel", function(color, pixel, tolerance) {
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
});
