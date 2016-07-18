var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');

var bodyParser  = require('body-parser');
var morgan      = require('morgan');

// driver mongo
var MongoClient = require('mongodb').MongoClient;

// per autenticazione e token
var jwt    = require('jsonwebtoken');

//file di config con la passphrase e database
var config = require('./config');

//porta settata
var port = process.env.PORT || 3000;

//connessione al database e set della passphrase
//mongoose.connect(config.database);
app.set('superSecret', config.secret);

// setta il body parser per leggere il json delle richieste POST
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// logger
app.use(morgan('dev'));

/*
 * apiRoutes è la variabile che fa riferimento al routing
 *
 */
var apiRoutes = express.Router();

apiRoutes.get('/events', function(req, res) {

    res.json({
        'events':[
            {
                'text':"Complix vale",
                'date':'16/04/2017'
            },
            {
                'text':"Buongiorno mondo",
                'date':'1/1/2017'
            },
        ]
    });
});

app.use('/api', apiRoutes);


/*
 * mette il server in ascolto sulla porta 3000
 *
 */
app.listen(port, function () {
  	console.log('Example app listening on http://localhost:'+port);
});
