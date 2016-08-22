var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');
var assert = require('assert');
var colors = require('colors');
var sha256 = require('sha256');
var geocoder = require('geocoder');

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
var url = process.env.URI || config.url;

url += port;

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

apiRoutes.get('/event', function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        db.collection('events').find().toArray(function(err, result) {

            if(err){
                console.log(JSON.stringify(err.message).red);
                return res.status(406).send(err);
            }

            if(result.length === 0){

                var error = {'name':'Events not found','message':'Eventi non trovati'};
                console.log(JSON.stringify(error).red);


                res.status(404).send(error);
            }else{

                console.log(JSON.stringify(result).green);
                res.send(result);
            }

            db.close();
        });
    });
});

apiRoutes.get('/event/img/:image',function(req, res) {

    img = req.params.image;
    console.log(img);
    res.sendFile(__dirname+'/data/img/'+img);
});

apiRoutes.put('/event', function(req, res) {

    //get coordinate from address
    geocoder.geocode(req.body.address, function ( err, data ) {

        if(err) res.send(err);

        var result = {
            address : data.results[0].formatted_address,
            coordinates : data.results[0].geometry.location
        };

        res.send(data);
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

apiRoutes.get('/user/:email',function(req,res){

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.send(err);

        db.collection('users').find({'_id':req.params.email}).toArray(function(err, result) {

            if(err) return res.send(err);

            console.log(result);

            if(result.length <= 0) {

                res.status(404).send("Error, specific user not found");

            } else {

                res.send(result[0]);
            }

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
                'password' : sha256(req.body.password)
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

apiRoutes.post('/user/:email',function(req, res) {

    //TODO controllare se esiste un body
    //TODO controllare se esiste l'email
    //TODO eseguire l'update della riga nel db

    var body = req.body;

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        var element = {};

        if(body.name) element.name = body.name;

        if(body.location) element.location = body.location;

        if(body.gender) element.gender = body.gender;

        if(body.birthDate) element.birthDate = body.birthDate;

        if(body.categories) element.categories = body.categories;

        var cond = {'_id':req.params.email};

        console.log(element);
        console.log(cond);

        db.collection('users').updateOne(cond,
            {
                '$set': element
            },
            function(err,result){

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                result = {
                    'name':'ok',
                    'message':result
                };

                console.log(JSON.stringify(result).green);
                res.send(result);

                db.close();
            });
    });
});

apiRoutes.post('/user/changepassword/:email', function(req, res) {

    var body = req.body;

    console.log(body);

    var newPass = sha256(body.newPassword);
    var oldPass = sha256(body.oldPassword);

    if(newPass && oldPass && (newPass != oldPass)) {

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var cond = {
                '_id':req.params.email,
                'password': oldPass
            };

            db.collection('users').updateOne(cond,
                {
                    '$set': {'password': newPass}
                },
                function(err,result){

                    if(err){
                        console.log(JSON.stringify(err.message).red);
                        return res.status(406).send(err);
                    }

                    result = {
                        'name':'ok',
                        'message':result
                    };

                    console.log(JSON.stringify(result).green);
                    res.send(result);

                    db.close();
                });
        });
    } else {

        console.log('Error, password not found'.red);
        return res.status(503).send(err);
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
                'password' : sha256(req.body.password)
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

                console.log(JSON.stringify(result).green);
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

/* ---------------------------------------- */

apiRoutes.put('/record/:email', function(req,res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        var date = new Date().getTime();

        console.log(date);

        var record = {
            'date' : date,
            'amount' : req.body.amount,
            'type' : req.body.type,
            'user' : req.params.email
        };

        if(req.body.event) {

            record.event = req.body.event;
        }

        console.log((record).green);

        db.collection('records').insertOne(record,function(err, result) {

            if(err){
                console.log(JSON.stringify(err.message).red);
                return res.status(406).send(err);
            }

            db.collection('users').updateOne(
                {'_id':record.user},
                {'$inc':{'balance':parseFloat(record.amount)}},
                function(err,result) {

                    if(err){
                        console.log(JSON.stringify(err.message).red);
                        return res.status(406).send(err);
                    }

                    result = {
                        'name':'ok',
                        'message':'Inserimento e aggiornamento saldo completato con successo'
                    };

                    console.log((result).green);
                    res.send(result);

                    db.close();
                }
            );
        });
    });
});

apiRoutes.get('/record/:email', function(req,res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err){
            console.log(JSON.stringify(err.message).red);
            return res.status(406).send(err);
        }

        db.collection('records').find({'user':req.params.email}).toArray(function(err,result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                console.log((result).green);
                res.send(result);

                db.close();
            }
        );
    });
});
/* ---------------------------------------- */

//TODO crea planner account

apiRoutes.put('/planner/register', function(req,res) {

    if(req.body.email && req.body.password){

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var planner = {
                '_id' : req.body.email,
                'password' : sha256(req.body.password),
                'events' : []
            };

            console.log('found = ' + JSON.stringify(planner).green);

            db.collection('planners').insertOne(planner,function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                result = {
                    'name':'ok',
                    'message':'Inserimento completato con successo'
                };

                console.log(JSON.stringify(result).green);
                res.send(result);

                db.close();
            });
        });
    }else {
        var err = {'name':'Planner not found','message':'Error, planner not found in body'};

        console.log(JSON.stringify(err.message).red);
        return res.status(406).send(err);
    }
});

apiRoutes.post('/planner/authenticate',function(req,res) {

    if(req.body.email && req.body.password){

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var cond = {
                '_id' : req.body.email,
                'password' : sha256(req.body.password)
            };

            console.log('found = ' + JSON.stringify(cond).green);

            db.collection('planners').findOne(cond, function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                if(result){

                    console.log(JSON.stringify(result).green);
                    res.send(result);
                }else{

                    var error = {'name':'Planner not found','message':'Error, planner not found in database'};
                    console.log(JSON.stringify(error).red);

                    res.status(404).send(error);
                }

                db.close();
            });
        });
    }else {
        var err = {'name':'Planner not found','message':'Error, planner not found in headers'};

        console.log(JSON.stringify(err.message).red);
        return res.status(406).send(err);
    }
});

apiRoutes.get('/planner/:email', function(req,res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.send(err);

        db.collection('planners').find({'_id':req.params.email}).toArray(function(err, result) {

            if(err) return res.send(err);

            console.log(result);

            if(result.length <= 0) {

                res.status(404).send({"message":"Error, specific planner not found"});

            } else {

                res.send(result[0]);
            }

            db.close();
        });
    });
});

apiRoutes.put('/planner/:email/event', function(req,res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        var cond = {
            '_id':req.params.email,
        };

        db.collection('planners').updateOne(cond,
            {
                '$push': {'events': req.body}
            },
            function(err,result){

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                result = {
                    'name':'ok',
                    'message':result
                };

                console.log(JSON.stringify(result).green);
                res.send(result);

                db.close();
            });
    });
});

apiRoutes.delete('/planner/:email', function(req,res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.send(err);

        db.collection('planners').deleteOne({'_id':req.params.email},function(err, result) {

            if(err) return res.send(err);

            console.log(result);

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
