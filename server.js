var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');
var assert = require('assert');
var colors = require('colors');

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

        db.collection('users').find().toArray(function(err, result) {

            if(err) return res.send(err);

            console.log(result);

            res.send(result);

            db.close();
        });
    });
});

apiRoutes.post('/user',function(req,res){

    if(req.body.email && req.body.password){

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var cond = {
                '_id' : req.body.email,
                'password' : req.body.password
            };

            console.log('found = ' + JSON.stringify(cond).green);

            db.collection('users').findOne(cond, function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                if(result){

                    console.log(JSON.stringify(result).green);
                    res.send(result);
                }else{

                    var error = {'name':'User not found','message':'Error, user not found in database'};
                    console.log(JSON.stringify(error).red);

                    res.status(404).send(error);
                }

                db.close();
            });
        });
    }else {
        var err = {'name':'User not found','message':'Error, user not found in headers'};

        console.log(JSON.stringify(err.message).red);
        return res.status(406).send(err);
    }
});

apiRoutes.put('/user',function(req, res) {

    if(req.body.email && req.body.password){

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var user = {
                '_id' : req.body.email,
                'password' : req.body.password
            };

            console.log('found = ' + JSON.stringify(user).green);

            db.collection('users').insertOne(user,function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                result = {
                    'name':'ok',
                    'message':'Inserimento completato con successo'
                };

                console.log(JSON.strigify(result).green);
                res.send(result);

                db.close();
            });
        });
    }else {
        var err = {'name':'User not found','message':'Error, user not found in headers'};

        console.log(JSON.stringify(err.message).red);
        return res.status(406).send(err);
    }
});

app.use('/api', apiRoutes);


/*
 * mette il server in ascolto sulla porta 3000
 *
 */
app.listen(port, function () {
  	console.log('FourEvent.Backend in listening on ' + url);
});
