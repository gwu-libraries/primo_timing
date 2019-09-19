function registerNewUrl() {
	/* Captures user input of a Primo VE URL and adds it to the databases.*/
	$('#url-submit').click(function (e) {
		let url = $('#url-input').val();
		$.post('url', {url: url})
			.done(function (data) {
				console.log(data);
			})
			.fail(function () {
				console.log('Request failed.');
			});
	});
}
registerNewUrl();