function PUBLIC(cls, name, method) {
	Object.defineProperty(cls.prototype, name, {
		"enumerable": false,
		"value": method,
	});
}

function STATIC(cls, name, method) {
	Object.defineProperty(cls, name, {
		"enumerable": false,
		"value": method,
	});
}
