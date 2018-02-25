var WIKI_BASE_URL = "https://wiki.mabinogiworld.com/api.php";
var LOGGED_IN = false, EDIT_TOKEN;

$(checkLoggedIn);

function checkLoggedIn() {
	$.ajax({
		"url": WIKI_BASE_URL,
		"method": "GET",
		"data": {
			"action": "query",
			"meta": "tokens",
			"type": "csrf|login",
			"format": "json",
		},
		"xhrFields": {
			"withCredentials": true,
		},
		"success": function (data) {
			if (data.query.tokens.csrftoken.length > 3) {
				loggedIn(data.query.tokens.csrftoken);
			}
			else {
				$.ajax({
					"url": WIKI_BASE_URL,
					"method": "GET",
					"data": {
						"action": "query",
						"meta": "authmanagerinfo",
						"amirequestsfor": "login",
						"format": "json",
					},
					"xhrFields": {
						"withCredentials": true,
					},
					"success": function (data2) {
						var $fields = $("#login-fields").empty();

						for (let request of data2.query.authmanagerinfo.requests) {
							for (let name in request.fields) {
								var field = request.fields[name];
								$("<div>")
								.addClass("login-field")
								.append(
									$("<span>").text(field.label),
									$("<input>").attr({
										"name": name,
										"type": field.type,
										"title": field.help,
									}).appendTo("<span>")
								)
								.appendTo($fields);
							}
						}

						$("<div>").addClass("button").text("Login")
						.click(login(data.query.tokens.logintoken))
						.appendTo($fields);
					},
					"error": console.warn,
				});
			}
		},
		"error": console.warn,
	});
}

function login(token) {
	return function () {
		// Get all the field data...
		var fields = new FormData();
		fields.append("action", "clientlogin");
		fields.append("format", "json");
		fields.append("logintoken", token);
		fields.append("loginreturnurl", location.href);

		$("#login-fields .login-field input").each(function () {
			var $this = $(this), val;

			switch ($this.attr("type")) {
				case "checkbox": case "radio":
					val = !!$this.is(":checked");
					break;
				default:
					val = $this.val();
					break;
				//
			}

			fields.append($this.attr("name"), val);
		});

		setStatus("Logging in...");

		$.ajax({
			"url": WIKI_BASE_URL,
			"method": "POST",
			"data": fields,
			"processData": false,
			"contentType": false,
			"xhrFields": {
				"withCredentials": true,
			},
			"success": function (data) {
				switch (data.clientlogin.status) {
					case "PASS":
						setStatus("Logged in.", "success");
						checkLoggedIn();
						break;
					case "FAIL":
						setStatus("Failed logging in...", "error");
						break;
					default:
						setStatus("Failed logging in (new login system)...", "error");
						console.warn("More to do:", data);
						break;
					//
				}
			},
			"error": console.warn,
		});
	}
}

function loggedIn(token) {
	LOGGED_IN = true;
	EDIT_TOKEN = token;

	$(".logged-out").hide();
	$(".logged-in").show();

	setStatus();
}

function logout() {
	LOGGED_IN = false;
	EDIT_TOKEN = undefined;

	$(".logged-out").show();
	$(".logged-in").hide();
}

function uploadImage(filename, image) {
	if (!LOGGED_IN) return;

	if (filename.substr(-4).toLowerCase() != ".png") {
		filename += ".png";
	}

	var formdata = new FormData();
	formdata.append("action", "upload");
	formdata.append("filename", filename);
	formdata.append("offset", 0);
	formdata.append("format", "json");
	formdata.append("ignorewarnings", 1); // TODO: don't
	formdata.append("token", EDIT_TOKEN);
	formdata.append("file", image);

	setStatus('<img src="img/loading.gif">');

	$.ajax({
		"url": WIKI_BASE_URL,
		"method": "POST",
		"data": formdata,
		"processData": false,
		"contentType": false,
		"xhrFields": {
			"withCredentials": true,
		},
		"success": function (data) {
			switch (data.upload.result) {
				case "Success":
					setStatus("Uploaded successfully!", "success");
					break;
				default:
					setStatus("Failed uploading.", "error");
					console.warn("Some issue with uploading?", data);
					break;
				//
			}
		},
		"error": console.warn,
	});
}

function setStatus(html, type) {
	if (html) {
		if (type) {
			html = $("<span>").addClass(type).append(html);
		}
	
		$(".status").empty().show().append(html);
	}
	else {
		$(".status").hide();
	}
}
