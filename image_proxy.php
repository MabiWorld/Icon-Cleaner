<?php
$url = isset($argv) ? $argv[1] : $_GET['url'];

$error_code = 200;

function get_lc_headers($url) {
	global $error_code;

	$ret = array();

	$headers = get_headers($url, true);
	$error_code = intval(substr($headers[0], 9, 3));

	foreach ($headers as $key => $value) {
		$ret[strtolower($key)] = $value;
	}

	return $ret;
}

function try_header($headers, $x) {
	$lcx = strtolower($x);
	 if (isset($headers[$lcx])) {
		 header("$x: " . $headers[$lcx]);
	 }
}

$headers = get_lc_headers($url);

if ($error_code == 200) {
	$contentType = preg_replace('#;.*$#', '', $headers['content-type']);
	if ($contentType == 'text/html') {
		$site = file_get_contents($url);

		// Parse and find image... First check preview.
		// <meta property="og:image" content="THIS"
		// <meta name="twitter:image" content="THIS"

		if (preg_match('#<meta\s+name="twitter:image"\s+content="([^"]+)"#i', $site, $matches)) {
			$url = $matches[1];
			$headers = get_lc_headers($url);
		}
		elseif (preg_match('#<meta\s+property="og:image"\s+content="([^"]+)"#i', $site, $matches)) {
			$url = $matches[1];
			$headers = get_lc_headers($url);
		}

		// Else handle specific instances...
		else {
			$error_code = 424;
		}
	}
}

if ($error_code == 200) {
	$contentType = preg_replace('#;.*$#', '', $headers['content-type']);
	$parts = explode('/', $contentType);
	
	if ($parts[0] == 'image') {
		// If this allows the client to download it, just redirect.
		if (isset($headers['access-control-allow-origin']) && $headers['access-control-allow-origin'] == '*') {
			header("Location: $url");
		}
		// Otherwise, only proxy if it's small enough...
		elseif (isset($headers['content-length']) && $headers['content-length'] < 1024 * 1024) {
			$image = file_get_contents($url);

			http_response_code(200);
			try_header($headers, 'Last-Modified');
			try_header($headers, 'Content-Type');
			try_header($headers, 'Content-Length');

			echo $image;
		}
		else {
			// Meant for client payload but w/e.
			$error_code = 413;
		}
	}
	else {
		// Meant for client payload but w/e.
		$error_code = 415;
	}
}

if ($error_code != 200) {
	http_response_code($error_code);
}
