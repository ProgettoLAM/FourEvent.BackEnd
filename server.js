var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');
var assert = require('assert');
var colors = require('colors');
var sha256 = require('sha256');
var geocoder = require('geocoder');
var multer = require('multer');


var bodyParser  = require('body-parser');
var morgan      = require('morgan');

// driver mongo
var mongo = require('mongodb');
var MongoClient = mongo.MongoClient;

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

var upload = multer({ dest: __dirname+'/data/img/'});
var apiRoutes = express.Router();


//EVENT-------------------------------------------------------------------------

apiRoutes.get('/event/:email', function(req, res) {

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

                var error = {'message':'Eventi non trovati'};
                console.log(JSON.stringify(error).red);

                res.status(404).send(error);
            }else{

                for(var i=0; i<result.length; i++) {

                    result[i].participate = false;
                    var users = result[i].user_participations;

                    for(var j=0; j<users.length; j++) {

                        if(req.params.email === users[j]) {

                            result[i].participate = true;
                        }
                    }
                }

                console.log(JSON.stringify(result).green);
                res.send(result);
            }

            db.close();
        });
    });
});

apiRoutes.get('/event/:email', function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.status(500).send(err);

        db.collection('planners').findOne({'_id':req.params.email},{'events':true,'_id':false},function(err, result) {

            if(err) return res.status(500).send(err);

            db.collection('events').find({'_id': { '$in' : result.events}}).toArray(function(err,result) {

                if(err) return res.status(500).send(err);


                if(result.length > 0) {

                    res.send(result);

                } else {

                    res.status(404).send('Eventi non trovati');
                }

                db.close();
            });
        });
    });
});

apiRoutes.delete('/event/:email/:id', function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.status(500).send(err);

        db.collection('planners').updateOne({'_id':req.params.email},
        {'$pull':{'events':req.params.id}},function(err, result) {

            if(err) return res.status(500).send(err);

            console.log(result);

            db.collection('events').removeOne({'_id': req.params.id },function(err,result) {

                if(err) return res.status(500).send(err);

                console.log(result);

                res.send('ok');

                db.close();
            });
        });
    });
});

apiRoutes.get('/event/img/:event_id',function(req, res) {

    console.log(req.params.event_id);

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.status(500).send(err);

        db.collection('events').findOne({'_id':mongo.ObjectID(req.params.event_id)},
            {'image':true,'_id':false},function(err, result) {

                if(err) return res.status(500).send({"message":err});

                res.sendFile(__dirname+'/data/img/'+result.image);
        });
    });
});

apiRoutes.put('/event/img',upload.single('file'), function(req, res) {

    var array = req.file.originalname.split('.');
    var ext = '.' + array[array.length-1];
    var name = new Date().getTime()+ext;

    var file = __dirname + '/data/img/' + name;
      fs.rename(req.file.path, file, function(err) {
        if (err) {
          console.log(err);
          res.status(500).send({'message':err});
        } else {

            console.log(JSON.stringify({
                message: 'File uploaded successfully',
                filename: name
            }).green);

            res.json({
                message: 'File uploaded successfully',
                filename: name
            });
        }
      });
});

apiRoutes.post('/event/partecipate/:event_id', function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err) {

            console.log(JSON.stringify(err).red);
            return res.status(500).send(err);
        }

        var condition = {'_id':mongo.ObjectID(req.params.event_id)};

        var update = {
            '$addToSet': {
                'user_participations':req.body.email
            }
        };

        db.collection('events').updateOne(condition,update,function(err,result) {

            if(err) {

                console.log(JSON.stringify(err).red);
                return res.status(500).send(err);
            }

            console.log(JSON.stringify(result).green);
            res.send(result);
        });
    });
});

//creazione dell'evento da parte del planner
apiRoutes.put('/event/', function(req, res) {

    var body = req.body;

    //get coordinate from address
    geocoder.geocode(body.address, function ( err, data ) {

        if(err) res.status(500).send(err);

        var event = {

            'title' : body.title,
            'tag' : '#'+body.tag,
            'description' : body.description,
            'start_date' : body.start_date,
            'participations' : 0,
            'user_participations' : [],
            'image' : body.image,
            'latitude' : data.results[0].geometry.location.lat,
            'longitude' : data.results[0].geometry.location.lng,
            'author' : body.author,
            'price' : "FREE"
        };

        data.results[0].address_components.forEach(function(component) {

            if(component.types[0] === 'locality') {

                event.address = component.short_name;
                console.log(event.address);
            }
        });

        if(body.end_date) event.end_date = body.end_date;
        if(body.tickets) event.tickets = body.tickets;
        if(body.price) event.price = body.price;

        MongoClient.connect(config.database, function(err, db) {

            if(err) return res.send(err);

            db.collection('events').insertOne(event,function(err,result) {

                if(err) return res.send(err);

                console.log(JSON.stringify(result).green);

                db.collection('planners').updateOne({'_id':event.author},
                    {'$push': {'events': event._id}},
                    function(err,result){

                        if(err){
                            console.log(JSON.stringify(err.message).red);
                            return res.status(406).send(err);
                        }

                        result = {
                            'name':'ok',
                            'message':result
                        };

                        console.log(JSON.stringify(event).green);
                        res.send(event);

                        db.close();
                });
            });
        });
    });
});

//USER--------------------------------------------------------------------------

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

//upload image user
apiRoutes.put('/user/img/:user_id',upload.single('file'), function(req, res) {

    var array = req.file.originalname.split('.');
    var ext = '.' + array[array.length-1];
    var name = req.params.user_id + ext;

    var file = __dirname + '/data/img/' + name;
      fs.rename(req.file.path, file, function(err) {
        if (err) {
          console.log(err);
          res.status(500).send({'message':err});
        } else {

            console.log(JSON.stringify({
                message : 'File uploaded successfully',
                filename : name
            }).green);

            res.json({
                message: 'File uploaded successfully',
                filename: name
            });
        }
      });
});

//download image user
apiRoutes.get('/user/img/:user_id',function(req, res) {

    console.log(req.params.user_id);

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.status(500).send(err);

        db.collection('users').findOne({'_id':req.params.user_id},
            {'image':true,'_id':false},function(err, result) {

                if(err) return res.status(500).send({"message":err});

                res.sendFile(__dirname+'/data/img/'+result.image);
        });
    });
});

//login
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

//completamento profilo
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

        if(body.image) element.image = body.image;

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

            console.log(cond);

            db.collection('users').findOne(cond, function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                var update = {
                    '$set': {'password': newPass}
                };

                console.log(result);

                if(result) {

                    db.collection('users').updateOne(cond,update,function(err,result){

                        if(err){
                            console.log(JSON.stringify(err.message).red);
                            return res.status(406).send(err);
                        }

                        result = {
                            'message':'Password cambiata con successo'
                        };

                        console.log(JSON.stringify(result).green);
                        res.send(result);

                        db.close();
                    });
                } else {
                    err = {"message":"Password errata"};
                    console.log(JSON.stringify(err).red);

                    return res.status(404).send(err);
                }
            });
        });

    } else {

        var err = {'message':'Errore, le password coincidono'};
        console.log(JSON.stringify(err).red);
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
                'password' : sha256(req.body.password),
                'balance' : 0
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

//RECORD------------------------------------------------------------------------

apiRoutes.put('/record/:email', function(req,res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        var date = new Date().getTime();

        console.log(date);

        //controllo che non esista già questo evento

        var record = {
            'date' : date,
            'amount' : req.body.amount,
            'type' : req.body.type,
            'user' : req.params.email
        };

        if(req.body.event) record.event = req.body.event;

        db.collection('records').findOne({

            'amount' : req.body.amount,
            'type' : req.body.type,
            'user' : req.params.email
            },
            function(err, result) {

            if(err){
                console.log(JSON.stringify(err.message).red);
                return res.status(406).send(err);
            }

            if(record.type === 'Acquisto biglietto' && result) {

                console.log(JSON.stringify({'message':'Biglietto già acquistato!'}).red);
                return res.status(403).send({'message':'Biglietto già acquistato!'});
            }

            db.collection('records').insertOne(record,function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                var response = result;

                db.collection('users').updateOne(
                    {'_id':record.user},
                    {'$inc':{'balance':parseFloat(record.amount)}},
                    function(err,result) {

                        if(err){
                            console.log(JSON.stringify(err.message).red);
                            return res.status(406).send(err);
                        }

                        console.log(JSON.stringify(result).green);

                        if(record.event && record.type === 'Acquisto biglietto') {

                            console.log(record.event);

                            db.collection('events').updateOne(
                                {
                                    '_id':new mongo.ObjectID(record.event)
                                },
                                {
                                    '$push' : {'user_participations':record.user},
                                    '$inc' : {'participations':1}
                                },
                                function(err, result) {

                                    if(err){
                                        console.log(JSON.stringify(err.message).red);
                                        return res.status(406).send(err);
                                    }

                                    console.log(JSON.stringify(result).green);

                                    res.send(record);
                                }
                            );

                        } else {

                            console.log((result).green);
                            res.send(record);

                            db.close();
                        }
                    }
                );
            });
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

                if(result.length < 0) {

                    db.close();
                    return res.status(404).send({'message':'Errore, record non trovati'});
                }

                console.log((result).green);
                res.send(result);

                db.close();
            }
        );
    });
});

apiRoutes.get('/tickets/:email', function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        if(err){
            console.log(JSON.stringify(err.message).red);
            return res.status(406).send(err);
        }

        db.collection('records').find({'user':req.params.email,'type':'Acquisto biglietto'}).toArray(function(err,result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                if(result.length === 0) {

                    db.close();
                    return res.status(404).send({'message':'Errore, record non trovati'});
                }

                console.log(JSON.stringify(result).green);
                res.send(result);

                db.close();
            }
        );
    });
});

//PLANNER-----------------------------------------------------------------------

apiRoutes.put('/planners/register', function(req,res) {

    if(req.body.email && req.body.password){

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var planner = {
                '_id' : req.body.email,
                'password' : sha256(req.body.password),
                'events' : [],
                'balance' : 0
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

apiRoutes.post('/planners/authenticate',function(req,res) {

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

//upload immagine profilo planner
apiRoutes.put('/planner/img/:planner_id',upload.single('file'),
    function(req, res) {

    var array = req.file.originalname.split('.');
    var ext = '.' + array[array.length-1];
    var name = req.params.planner_id + ext;

    var file = __dirname + '/data/img/' + name;
      fs.rename(req.file.path, file, function(err) {
        if (err) {
          console.log(err);
          res.status(500).send({'message':err});
        } else {

            console.log(JSON.stringify({
                message: 'File uploaded successfully',
                filename: name
            }).green);

            res.json({
                message: 'File uploaded successfully',
                filename: name
            });
        }
      });
});

//download immagine profilo planner
apiRoutes.get('/planner/img/:planner_id',function(req, res) {

    console.log(req.params.planner_id);

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.status(500).send(err);

        db.collection('planners').findOne({'_id':mongo.ObjectID(req.params.planner_id)},
            {'image':true,'_id':false},function(err, result) {

                if(err) return res.status(500).send({"message":err});

                res.sendFile(__dirname+'/data/img/'+result.image);
        });
    });
});

//completamento profilo planner
apiRoutes.post('/planners/:email', function(req,res) {

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

        if(body.role) element.role = body.role;

        if(body.image) element.image = body.image;

        var cond = {'_id':req.params.email};

        console.log(element);
        console.log(cond);

        db.collection('planners').updateOne(cond,
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

apiRoutes.get('/planners/:email', function(req,res) {

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

apiRoutes.delete('/planners/:email', function(req,res) {

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

//------------------------------------------------------------------------------

app.use('/api', apiRoutes);


/*
 * mette il server in ascolto sulla porta 3000
 *
 */
app.listen(port, function () {
  	console.log('FourEvent.Backend in listening on ' + url);
});
