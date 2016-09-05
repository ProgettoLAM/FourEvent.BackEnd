var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');
var assert = require('assert');
var colors = require('colors');
var sha256 = require('sha256');
var geocoder = require('geocoder');
var multer = require('multer');
var qr = require('qr-image');
var gcm = require('node-gcm');

var bodyParser  = require('body-parser');
var morgan      = require('morgan');

// driver mongo
var mongo = require('mongodb');
var MongoClient = mongo.MongoClient;

// per autenticazione e token
var jwt    = require('jsonwebtoken');

//file di config con la passphrase e database
var config = require('./config');
var keys = require('./keys');

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

var db;

MongoClient.connect(config.database, function(err, database) {
        db = database;
});

//EVENT-------------------------------------------------------------------------

function checkParticipation(result,email) {

    for(var i=0; i<result.length; i++) {

        result[i].participate = false;
        var users = result[i].user_participations;

        for(var j=0; j<users.length; j++) {

            if(email === users[j]) {

                result[i].participate = true;
            }
        }
    }

    return result;
}


apiRoutes.get('/event/:email', function(req, res) {

    var cond, project;
    switch (req.query.type) {
        case "near":

            var lng = req.query.lng,
                lat = req.query.lat;

            if(lng && lat) {

                cond = [
                    {
                        "$geoNear": {
                            "near": {
                                 "type": "Point",
                                 "coordinates": [parseFloat(lng), parseFloat(lat)]
                             },
                             "distanceField": "distance",
                             "maxDistance": 5000,
                             "spherical": true,
                             "query": { "loc.type": "Point" }
                         }
                    },
                    {
                         "$sort": {"distance": 1} // Sort the nearest first
                    }
                ];

                db.collection(keys.EVENT).aggregate(cond,function(err,result) {

                    if(err) return handleError(err,500,res);

                    if(result.length === 0) return handleError({'message':'Eventi non trovati'},404,res);

                    res.send(checkParticipation(result,req.params.email));
                });

            } else
                return handleError({'message':'Forbidden'},406,res);

            break;

        case "category":

            cond = {'_id':req.params.email};
            project = {'categories.name':1,'_id':0};
            db.collection(keys.USER).findOne(cond,project,function(err, result) {

                if(err) return handleError(err,500,res);

                var tmpCat = [];
                for(var i=0; i<result.categories.length; i++) {

                    tmpCat.push(result.categories[i].name);
                }

                cond = {'tag':{'$in':tmpCat}};
                db.collection(keys.EVENT).find(cond).toArray(function(err, result) {

                    if(err) return handleError(err,500,res);

                    if(result.length === 0) return handleError({'message':'Eventi non trovati'},404,res);

                    res.send(checkParticipation(result,req.params.email));
                });
            });
            break;

        case "popular":

            cond = {'popular':true};
            db.collection(keys.EVENT).find(cond).toArray(function(err,result) {

                if(err) return handleError(err,500,res);

                if(result.length === 0) return handleError({'message':'Non ci sono eventi popolari'},404,res);

                res.send(checkParticipation(result,req.params.email));
            });

            break;

        default:
            return handleError({'message':'tipo non trovato'},404,res);
    }
});

apiRoutes.get('/event/img/:event_id',function(req, res) {

    var cond = {'_id':mongo.ObjectID(req.params.event_id)};
    var project = {'image':true,'_id':false};
    db.collection(keys.EVENT).findOne(cond,project,function(err, result) {

        if(err) return handleError(err,500,res);

        res.sendFile(__dirname+'/data/img/'+result.image+'.png');
    });
});


apiRoutes.put('/event/', function(req, res) {

    var cond, update, body = req.body;

    geocoder.geocode(body.address, function ( err, data ) {

        if(err) return handleError(err,500,res);

        var event = {

            'title' : body.title,
            'tag' : body.tag,
            'description' : body.description,
            'start_date' : body.start_date,
            'user_participations' : [],
            'user_checked' : [],
            'image' : body.image,
            'loc':{
                type: "Point",
                coordinates: [
                    data.results[0].geometry.location.lng,
                    data.results[0].geometry.location.lat
                ]
            },
            'author' : body.author,
            'price' : "FREE",
        };


        var totalAddress = data.results[0].formatted_address.split(",");
        event.street_address = totalAddress[0]+', '+totalAddress[1];

        data.results[0].address_components.forEach(function(component) {

            if(component.types[0] === 'locality') {

                event.address = component.short_name;
                console.log(event.address);
            }
        });

        if(body.end_date) event.end_date = body.end_date;
        if(body.tickets) event.tickets = body.tickets;
        if(body.price) event.price = body.price;

        db.collection(keys.EVENT).insertOne(event,function(err,result) {

            if(err) return handleError(err,500,res);

            cond = {'_id':event.author};
            update = {'$push': {'events': event._id}};
            db.collection(keys.PLANNER).updateOne(cond,update,function(err,result){

                if(err) return handleError(err,500,res);

                res.send(event);
            });
        });
    });
});

apiRoutes.put('/event/img/:name',upload.single('file'), function(req, res) {

    var array = req.file.originalname.split('.');
    var name = req.params.name + '.' + array[array.length-1];

    var file = __dirname + '/data/img/' + name;
    fs.rename(req.file.path, file, function(err) {

        if(err) return handleError(err,500,res);

        res.send({'filename':req.params.name});
    });
});


apiRoutes.post('/event/participate/:event_id', function(req, res) {

    var condition,update;

    condition = {'_id':mongo.ObjectID(req.params.event_id)};
    update = {'$addToSet': {'user_participations':req.body.email}};
    db.collection(keys.EVENT).updateOne(condition,update,function(err,result) {

        if(err) return handleError(err,500,res);

        if(result.result.nModified === 0)
            return handleError({'message':'Partecipi già a questo evento'},403,res);

        condition = [{'$match' : condition},{'$project': {'participations': { $size: "$user_participations" }}}];
        db.collection(keys.EVENT).aggregate(condition, function(err, result) {

            result[0].message = 'Evvai!, adesso partecipi a questo evento!';
            res.send(result[0]);
        });
    });
});

apiRoutes.post('/event/notparticipate/:event_id', function(req, res) {

    var condition,update;

    condition = {'_id':mongo.ObjectID(req.params.event_id)};
    update = {'$pull': {'user_participations':req.body.email}};
    db.collection(keys.EVENT).updateOne(condition,update,function(err,result) {

        if(err) return handleError(err,500,res);

        if(result.result.nModified === 0)
            return handleError({'message':"Errore, non partecipi all'evento"},406,res);

        condition = [{'$match' : condition},{'$project': {'participations': { $size: "$user_participations" }}}];
        db.collection(keys.EVENT).aggregate(condition, function(err, result) {

            result[0].message = 'Non partecipi più a questo evento!';
            res.send(result[0]);
        });
    });
});


apiRoutes.delete('/event/:email/:id', function(req, res) {

    var cond,update;

    cond = {'_id':req.params.email};
    update = {'$pull':{'events':mongo.ObjectID(req.params.id)}};
    db.collection(keys.PLANNER).updateOne(cond,update,function(err, result) {

        if(err) return handleError(err,500,res);

        if(result.result.n === 0)
            return handleError({'message':"Non hai i permessi per completare l'operazione"},403,res);

        cond = {'_id': mongo.ObjectID(req.params.id)};
        db.collection(keys.EVENT).removeOne(cond,function(err,result) {

            if(err) return handleError(err,500,res);

            if(result.result.n === 0) return handleError({'message':'Evento non trovato'},404,res);

            res.send({'message':'Evento eliminato'});
        });
    });
});

//USER--------------------------------------------------------------------------

apiRoutes.get('/user',function(req,res){

    db.collection(keys.USER).find().toArray(function(err, result) {

        if(err) return handleError(err,500,res);

        res.send(result);
    });
});

apiRoutes.get('/user/:email',function(req,res){

    var cond = {'_id':req.params.email};
    db.collection(keys.USER).findOne(cond,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result)
            return handleError({'message':'Utente non trovato'},404,res);

        res.send(result);
    });
});

apiRoutes.get('/user/img/:user_id',function(req, res) {

    var cond = {'_id':req.params.user_id},
        proj = {'_id':true};
    db.collection(keys.USER).findOne(cond,proj,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Utente non trovato'},404,res);

        res.sendFile(__dirname+'/data/img/'+result.image);
    });
});


apiRoutes.put('/user/img/:user_id',upload.single('file'), function(req, res) {

    var array = req.file.originalname.split('.');
    var name = req.params.user_id + '.' + array[array.length-1];

    var file = __dirname + '/data/img/' + name;
    fs.rename(req.file.path, file, function(err) {

        if(err) return handleError(err,500,res);

        res.send({'filename': name});
    });
});

apiRoutes.put('/user',function(req, res) {

    //controllo se il client mi ha passato email e password
    if(req.body.email && req.body.password){

        //imposto l'utente
        var user = {
            '_id' : req.body.email,
            'password' : sha256(req.body.password),
            'gcm_token' : req.body.gcm_token,
            'balance' : 0
        };

        //inserisco l'utente nella collection utenti
        db.collection(keys.USER).insertOne(user,function(err, result) {

            if(err) return handleError({'message':"Errore, email già esistente"},406,res);

            res.send({'message':'Inserimento completato con successo'});
        });
    }

    else return handleError({'message':'Errore, utente non trovato!'},406,res);
});


apiRoutes.post('/user',function(req,res){

    if(!req.body.email || !req.body.password)
        return handleError({'message':'Utente non trovato'},403,res);

    var cond = {'_id' : req.body.email,'password' : sha256(req.body.password)};
    db.collection(keys.USER).findOne(cond, function(err, result) {

        if(err) return handleError(err,500,res);

        res.send(result);
    });
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

        if(body.birth_date) element.birth_date = body.birth_date;

        if(body.categories) element.categories = body.categories;

        if(body.image) element.image = body.image;

        var cond = {'_id':req.params.email};

        console.log(element);
        console.log(cond);

        db.collection(keys.USER).updateOne(cond,
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

    var body = req.body,
        newPass = sha256(body.newPassword),
        oldPass = sha256(body.oldPassword),
        cond,update;

    if(!newPass || !oldPass && (newPass === oldPass))
        return handleError({'message':'Le due password coincidono'},403,res);

    cond = {'_id':req.params.email,'password': oldPass};
    db.collection(keys.USER).findOne(cond, function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Utente non trovato'},500,res);

        update = {'$set': {'password': newPass}};
        db.collection(keys.USER).updateOne(cond,update,function(err,result){

            if(err) return handleError(err,500,res);

            res.send({'message':'Password cambiata con successo'});
        });
    });
});


//RECORD------------------------------------------------------------------------

apiRoutes.get('/record/:email', function(req,res) {

    var cond;

    cond = {'user':req.params.email};
    db.collection(keys.RECORD).find(cond).toArray(function(err,result) {

        if(err) return handleError(err,500,res);

        var recordsLeft = result.length;
        var onComplete = function() { res.send(result); };

        if(recordsLeft.length === 0)
            return handleError({'message':'Errore, record non trovati'},404,res);

        result.forEach(function(record) {

            if(record.type === "Acquisto biglietto") {

                cond = {'_id':mongo.ObjectID(record.event)};
                db.collection(keys.EVENT).findOne(cond,function(err,result) {

                    if(err) return handleError(err,500,res);

                    if(result) {

                        record.event = result.title;

                    } else {
                        console.log({'message':'Evento non trovato'}.red);
                    }

                    if(--recordsLeft === 0) {

                        onComplete();
                    }
                });
            } else {

                if(--recordsLeft === 0) {

                    onComplete();
                }
            }
        });
    });
});

apiRoutes.get('/ticket/:email', function(req, res) {

    var cond;

    //cerco tutti i record che indicano l'acquisto di un biglietto
    cond = {'user':req.params.email,'type':'Acquisto biglietto'};
    db.collection(keys.RECORD).find(cond).toArray(function(err,result) {

        if(err) return handleError(err, 500, res);

        var ticketsLeft = result.length;
        var onComplete = function() { res.send(result); };

        if(ticketsLeft === 0)
            return handleError({'message':'Errore, record non trovati'},404,res);

        result.forEach(function(ticket) {

            console.log(ticket.event);
            cond = {'_id':mongo.ObjectID(ticket.event)};
            db.collection(keys.EVENT).findOne(cond,function(err,result) {

                if(err) return handleError(err,500,res);

                if(result) ticket.event = result.title;

                if(--ticketsLeft === 0) {

                    onComplete();
                }
            });
        });
    });
});

apiRoutes.get('/ticket/tag/:id', function(req, res) {

    var cond, record, update, event, proj;
    cond = {'_id':mongo.ObjectID(req.params.id)};
    db.collection(keys.RECORD).findOne(cond,function(err,result) {

        if(err) return handleError(err, 500, res);

        if(!result)
            return handleError({'message':'Il biglietto non corrisponde a nessun biglietto esistente'},404,res);

        event = result.event;
        cond = {_id:result.user};
        db.collection(keys.USER).findOne(cond,function(err,result) {

            if(err) return handleError(err, 500, res);

            if(!result)
                return handleError({'message':"Non è stato possibile trovare l'utente proprietario del biglietto"},404,res);

            cond = {_id:mongo.ObjectID(event)};
            update = {$push:{user_checked:result.user}};
            db.collection(keys.EVENT).updateOne(cond,update,function(err,result) {

                if(err) return handleError(err, 500, res);

                //TODO restituire il numero di partecipanti effettivi all'evento, per fare l'update
                //TODO usare un aggregate di mongodb
                res.send(result);
            });
        });
    });
});


apiRoutes.put('/record/:email', function(req,res) {

    var condition,
        update;
    //creo il nuovo record da inserire nel database
    //controllando se è un acquisto, in questo caso ha anche l'id dell'evento
    var date = new Date().getTime();
    var record = {
        'date' : date,
        'amount' : req.body.amount,
        'type' : req.body.type,
        'user' : req.params.email
    };
    if(req.body.event) record.event = req.body.event;

    //cerco lo stesso record all'interno della collection record
    condition = {'amount' : req.body.amount,'type' : req.body.type,'user' : req.params.email};
    db.collection(keys.RECORD).findOne(condition,function(err, result) {

        if(err) return handleError(err,500,res);

        //se il record cercato è un acquisto di un biglietto
        //e se la query indica che esiste già lo stesso risultato
        //ritorno un errore, notificando l'acquisto già avvenuto
        if(record.type === 'Acquisto biglietto' && result) {

            if(err) return handleError({'message':'Biglietto già acquistato!'},403,res);
        }

        //provo ad inserire il biglietto all'interno della collection records
        db.collection(keys.RECORD).insertOne(record,function(err, result) {

            if(err) return handleError(err,406,res);

            //eseguo l'update del campo balance dell'utente scelto
            condition = {'_id':record.user};
            update = {'$inc':{'balance':parseFloat(record.amount)}};
            db.collection(keys.USER).updateOne(condition,update,function(err,result) {

                if(err) return handleError(err,406,res);

                //se si tratta dell'acquisto di un biglietto
                //aggiungo l'email dell'utente tra i partecipanti dell'evento
                if(record.event && record.type === 'Acquisto biglietto') {

                    var response = {'record': record};

                    //aggiungo all'array delle partecipazioni, l'email dell'utente
                    condition ={'_id':new mongo.ObjectID(record.event)};
                    update = {'$push' : {'user_participations':record.user}};
                    db.collection(keys.EVENT).updateOne(condition,update,function(err, result) {

                        if(err) return handleError(err,406,res);

                        //eseguo un aggregate per restituirmi la lunghezza dell'array delle partecipazioni
                        condition = [{'$match' : condition},{'$project': {'participations': { $size: "$user_participations" }}}];
                        db.collection(keys.EVENT).aggregate(condition, function(err, result) {

                            /*
                            var imageName = 'qr_'+req.params.id+'.png',
                                imagePath = keys.ASSETS_DIR+'qr/'+imageName,
                                qr_svg = qr.image(req.params.id, { type: 'png' });

                            qr_svg.pipe(fs.createWriteStream(imagePath));
                            */

                            response.message = 'Evvai!, adesso partecipi a questo evento!';
                            response.participations = result[0].participations;
                            res.send(response);
                        });
                    });

                } else {

                    console.log((result).green);
                    res.send(record);
                }
            });
        });
    });
});

apiRoutes.put('/record/planner/:email', function(req,res) {

    var condition,update,project;
    //creo il nuovo record da inserire nel database
    //controllando se è un acquisto, in questo caso ha anche l'id dell'evento
    var date = new Date().getTime();
    var record = {
        'date' : date,
        'amount' : req.body.amount,
        'type' : req.body.type,
        'user' : req.params.email
    };
    if(req.body.event) record.event = req.body.event;

    db.collection(keys.RECORD).insertOne(record,function(err, result) {

        if(err) return handleError(err,406,res);

        //eseguo l'update del campo balance dell'utente scelto
        condition = {'_id':record.user};
        update = {'$inc':{'balance':parseFloat(record.amount)}};
        db.collection(keys.PLANNER).updateOne(condition,update,function(err,result) {

            if(err) return handleError(err,406,res);

            if(result.result.nModified === 0) return handleError({'message':'Operazione non conclusa'},406,res);

            res.send(record);
        });
    });
});

//PLANNER-----------------------------------------------------------------------



apiRoutes.get('/planner/img/:planner_id',function(req, res) {

    var cond = {'_id':req.params.planner_id},
        proj = {'_id':false};
    db.collection(keys.PLANNER).findOne(cond,proj,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Utente non trovato'},404,res);

        res.sendFile(__dirname+'/data/img/'+result._id);
    });
});

apiRoutes.get('/planner/:email', function(req,res) {

    var cond = {'_id':req.params.email};
    db.collection(keys.PLANNER).findOne(cond,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) handleError({'message':'Utente non trovato'},404,res);

        res.send(result);
    });
});

apiRoutes.get('/planner/event/:planner_email', function(req, res) {

    var cond,project;

    //cerco la lista di id degli eventi di un planner
    cond = {'_id':req.params.planner_email};
    project = {'events':true,'_id':false};

    db.collection(keys.PLANNER).findOne(cond,project,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Non è possibile completare la richiesta'},403,res);

        //cerco tutti gli eventi di quel planner
        cond = {'_id': { '$in' : result.events}};
        db.collection(keys.EVENT).find(cond).toArray(function(err,result) {

            if(err) return handleError(err,500,res);

            if(result.length === 0) return handleError({'message':'Eventi non trovati'},404,res);

            res.send(result);
        });
    });
});

apiRoutes.get('/planner/detail/:event_id', function(req,res) {

    var response, proj, aggregate, cond = {_id:mongo.ObjectID(req.params.event_id)};
    db.collection(keys.EVENT).findOne(cond,function(err,result) {

        if(err) return handleError(err,500,res);

        if(!result)
            return handleError({'message':'Evento non trovato'},404,res);

        response = result;

        cond = {'_id': { '$in' : result.user_participations}};
        aggregate = [
            {$match:cond},
            {
                $group:{
                    _id:'$gender',count:{$sum:1}
                }
            }
        ];
        db.collection(keys.USER).aggregate(aggregate,function(err,result) {

            if(err) return handleError(err,500,res);

            if(!result)
                return handleError({'message':'Utenti non trovati'},404,res);

            response.gender_stats = result;

            proj = {_id:0,birth_date:1};
            db.collection(keys.USER).find(cond,proj).toArray(function(err,result) {

                if(err) return handleError(err,500,res);

                if(!result)
                    return handleError({'message':'Utenti non trovati'},404,res);

                var dates = [], today = new Date();
                for(var element in result){

                    dates.push(getAge(element));
                }

                response.ages = dates;
                res.send(response);
            });
        });

    });
});


apiRoutes.put('/planner/register', function(req,res) {

    if(!req.body.email || !req.body.password)
        return handleError({'message':'Inserire email e password'},403,res);

    var planner = {
        '_id' : req.body.email,
        'password' : sha256(req.body.password),
        'events' : [],
        'balance' : 0
    };
    db.collection(keys.PLANNER).insertOne(planner,function(err, result) {

        if(err) return handleError(err,403,res);

        res.send({'message':'Inserimento completato con successo'});
    });
});

apiRoutes.put('/planner/img/:planner_id',upload.single('file'),function(req, res) {

    var array = req.file.originalname.split('.');
    var name = req.params.planner_id + '.' + array[array.length-1];

    var file = __dirname + '/data/img/' + name;
    fs.rename(req.file.path, file, function(err) {

        if(err) return handleError(err,500,res);

        res.send({'filename': name});
    });
});


apiRoutes.post('/planner/authenticate',function(req,res) {

    var cond;
    if(!req.body.email || !req.body.password)
        return handleError({'message':'Inserire email e password'},403,res);

    cond = {'_id' : req.body.email,'password' : sha256(req.body.password)};
    db.collection(keys.PLANNER).findOne(cond, function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Utente non trovato'},404,res);

        res.send(result);
    });
});

apiRoutes.post('/planner/:email', function(req,res) {

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

        db.collection(keys.PLANNER).updateOne(cond,
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

apiRoutes.post('/planner/changepassword/:email', function(req, res) {

    if(!req.body.newPassword || !req.body.oldPassword)
        return handleError({'message':'Password non trovate'},404,res);

    var body = req.body,
        newPass = sha256(body.newPassword),
        oldPass = sha256(body.oldPassword),
        cond,update;

    if(newPass === oldPass)
        return handleError({'message':'Le password coincidono'},403,res);

    cond = {'_id':req.params.email,'password': oldPass};
    db.collection(keys.PLANNER).findOne(cond, function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'password non coincidente'},500,res);

        update = {'$set': {'password': newPass}};
        db.collection(keys.PLANNER).updateOne(cond,update,function(err,result){

            if(err) return handleError(err,500,res);

            res.send({'message':'Password cambiata con successo'});
        });
    });
});

apiRoutes.post('/planner/maxticket/:email', function(req,res) {

    var cond,update,
        date = new Date().getTime(),
        record = {
            'date' : date,
            'amount' : req.body.amount,
            'type' : req.body.type,
            'user' : req.params.email,
            'event' : req.body.event
        };

    cond = {'_id':record.user};
    update = {'$inc':{'balance':parseInt(record.amount)}};
    db.collection(keys.PLANNER).updateOne(cond,update,function(err,result) {

        if(err) return handleError(err,500,res);

        if(result.result.nModified === 0)
            return handleError({'message':'Non è possibile effettuare il decremento del bilancio'},500,res);

        db.collection(keys.RECORD).insertOne(record, function(err,result) {

            if(err) return handleError(err,500,res);

            cond = {'_id':mongo.ObjectID(record.event)};
            update = {'$set':{'tickets':req.body.newMax}};
            db.collection(keys.EVENT).updateOne(cond,update,function(err,result) {

                if(err) return handleError(err,500,res);

                if(result.result.nModified === 0)
                    return handleError({'message':"Non è possibile effettuare l'incremento di biglietti"},500,res);

                res.send({'message':'Corretto!'});
            });
        });
    });
});

apiRoutes.post('/planner/popular/:email', function(req,res) {

    var cond,update,
        date = new Date().getTime(),
        record = {
            'date' : date,
            'amount' : req.body.amount,
            'type' : req.body.type,
            'user' : req.params.email,
            'event' : req.body.event
        };

    cond = {'_id':record.user};
    update = {'$inc':{'balance':parseInt(record.amount)}};
    db.collection(keys.PLANNER).updateOne(cond,update,function(err,result) {

        if(err) return handleError(err,500,res);

        if(result.result.nModified === 0)
            return handleError({'message':'Non è possibile effettuare il decremento del bilancio'},500,res);

        db.collection(keys.RECORD).insertOne(record, function(err,result) {

            if(err) return handleError(err,500,res);

            cond = {'_id':mongo.ObjectID(record.event)};
            update = {'$set':{'popular':true}};
            db.collection(keys.EVENT).updateOne(cond,update,function(err,result) {

                if(err) return handleError(err,500,res);

                if(result.result.nModified === 0)
                    return handleError({'message':"Non è possibile pubblicizzare l'evento richiesto"},500,res);

                res.send({'message':'Corretto!'});
            });
        });
    });
});

apiRoutes.post('/planner/sendmessage/:event', function(req,res) {

    var proj = {_id:0,user_participations:1,title:1},
        cond = {_id:mongo.ObjectID(req.params.event)},
        text = req.body.text;
    db.collection(keys.EVENT).findOne(cond,proj,function(err,result) {

        if(err) return handleError(err,500,res);

        if(!result)
            return handleError({'message':'Evento non trovati'},404,res);

        var users = result.user_participations,
            cond = {'_id': { '$in' : users}},
            proj = {_id:0,gcm_token:1},
            title = result.title;
        db.collection(keys.USER).find(cond,proj).toArray(function(err,result) {

            if(err) return handleError(err,500,res);

            if(result.length === 0)
                return handleError({'message':'Utenti non trovati'},404,res);

            var sender = new gcm.Sender(config.gcm_key), regTokens = [];
            for(var i=0; i<result.length; i++) {
                regTokens.push(result[i].gcm_token);
            }

            var message = new gcm.Message({
                data: {
                    title : 'Notifica da : ' + title,
                    message: text
                }
            });

            sender.send(message, { registrationTokens: regTokens }, function (err, response) {
                if(err) return handleError(err,500,res);

                res.send({'message':'messaggio inviato con successo!'});
            });
        });
    });
});


apiRoutes.delete('/planners/:email', function(req,res) {

    var cond = {'_id':req.params.email};
    db.collection(keys.PLANNER).deleteOne(cond,function(err, result) {

        if(err) return handleError(err,500,res);

        res.send(result);
    });
});

function getAge(dateString)
{
    var today = new Date();
    var birthDate = new Date(dateString);
    var age = today.getFullYear() - birthDate.getFullYear();
    var m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate()))
    {
        age--;
    }
    return age;
}

//------------------------------------------------------------------------------

app.use('/api', apiRoutes);

function handleError(err,status,res) {

    if(err.message)
        console.log(JSON.stringify(err.message).red);
    return res.status(status).send(err);
}

app.listen(port, function () {
  	console.log('FourEvent.Backend in listening on ' + url);
});
