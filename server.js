var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');
var assert = require('assert');

var bodyParser  = require('body-parser');
var morgan      = require('morgan');

// driver mongo
var MongoClient = require('mongodb').MongoClient;

// per autenticazione e token
var jwt    = require('jsonwebtoken');

//file di config con la passphrase e database
var config = require('./config');

//porta settata
var port = process.env.PORT || 8080;

var url = 'http://localhost:'+port;

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
                'title':"Comply ValeXS",
                'address':'Via Adda 8',
                'date':'16/04/2017',
                'tag':'#complix'
            },
            {
                'title':"Comply ValeXS",
                'address':'Via Adda 8',
                'date':'16/04/2017',
                'tag':'#complix'
            },
        ]
    });
});

apiRoutes.get('/user',function(req,res){

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.send(err);

        db.collection('users').find(function(err, result) {

            if(err) return res.send(err);

            res.send(result);

            db.close();
        });
    });
});

apiRoutes.put('/user',function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.send(err);

        var user = {
            '_id' : req.body.email,
            'password' : req.body.password
        };

        console.log(user);

        db.collection('users').insertOne(user,function(err, result) {

            if(err) return res.send(err);

            res.send(result);

            db.close();
        });
    });
});

app.use('/api', apiRoutes);


/*
 * mette il server in ascolto sulla porta 3000
 *
 */
app.listen(port, function () {
  	console.log('FourEvent.Backend in listening on ' + url);
});
