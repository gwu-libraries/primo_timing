var express = require('express'),
	app = express(),
	bodyParser = require('body-parser');

app.use(express.static('./'));
app.use(bodyParser.text());
app.use(bodyParser.urlencoded({
    extended: true
}));
server = app.listen(3000);


app.get('/', (req, res) => {
	
	res.sendFile(__dirname + '/index.html');	
});
