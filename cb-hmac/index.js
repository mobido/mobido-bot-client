const crypto = require('crypto');
const MWS = require('mobido-bot-client');
const cache = require('mobido-bot-client/cache');
const net = require('mobido-bot-client/net');
const FIFTEEN_MINUTES = 1000 * 60 * 15;

const DEBUG = true;

const cardPublicKeyCache = new cache.Cache();

// amazon prototype
// X-Amzn-Authorization: AWS3 AWSAccessKeyId=AKIAIOSFODNN7EXAMPLE,Algorithm=HmacSHA256,SignedHeaders=Host;X-Amz-Date;X-Amz-Target;Content-Encoding,Signature=tzjkF55lxAxPhzp/BRGFYQRQRq6CqrM254dTDE/EncI=

// our version of Card to Bot (CB) HMAC
// NOTE: This is different than what the Mobido server API uses
// X-Mobido-Authorization: CB-HMAC algo=sha256,cid=wed23r2e,tid=1_56!,ckid=2011-10-05T14:48:00.000Z,bkid=2011-10-05T14:48:00.000Z,headers=Host;x-mobido-date,sig=23623nbwdmnwsd==
// X-Mobido-Date: Thu, 28 Apr 2016 07:37:46 GMT
//    algo= sha256, etc. used by hmac
//    cid= card sending request to bot
//    tid= thread that card and bot are in
//    ckid= card key id, used to create secret for this request
//    bkid= bot key id, used to create secret for this request
//    NOTE: card key and bot key must use same DH group (i.e. modp14)

exports.startVerification = function( req, res, next ) {
    if( req.headers['x-mobido-authorization'] ) {
        if( DEBUG )
            console.log( 'X-Mobido-Authorization offered for',req.originalUrl,req.headers['x-mobido-authorization']);

        // wire up to capture body data...
        req.hmac = { body:[] };
        req.on('data', function(chunk) {
            if( req.hmac ) {
                req.hmac.body.push( chunk );
                if( DEBUG ) console.log( 'Saving chunk for later' );
            } else if( DEBUG ) {
                console.log( 'Received more data after isSecure() was called?!');
            }
        });
    } else if( DEBUG )
        console.log( 'X-Mobido-Authorization NOT offered',req.originalUrl);

    next();
}

exports.hasAuthorization = function( req ) {
    if( req.headers['x-mobido-authorization'] )
        return true;
    else
        return false;   
}

// the first time this is run, check the HMAC signatures if we have the info
// If the signatures match up, set the req.cid and req.tid fields
// mobidoAccessKey: { id:, secret: } NOT USED right now, lets this server ask Mobido servers for the user cards public key
// botKeys: id => crypto map, i.e. { '2011-10-05T14:48:00.000Z': { type:'dh1k', values:[base64publickey, base64privatekey] }
exports.isSecure = function( req, mobidoAccessKey, botKeys, next ) {
    if( DEBUG ) console.log( "isSecure?" );
    if( req.cid )
        return next(null,true);
    var hmac = req.hmac;
    if( !hmac ) {
        next(null,false);
        return;
    }

    // make sure its not too old (15 minutes max)
    var dateHeader = req.headers['x-mobido-date'];
    if( !dateHeader )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'Missing x-mobido-date header')); 
    if( DEBUG )
        console.log( 'X-Mobido-Date:', dateHeader );  
    var requestTime = Date.parse( dateHeader );
    if( isNaN(requestTime) )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'HMAC Failed to parse date ' + dateHeader));

    // crack the auth header apart...
    var authHeader = req.headers['x-mobido-authorization'];
    var tokens = authHeader.split(/\s+/);
    if( tokens.length < 2 )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'Missing authentication argument ' + authHeader));
    var authType = tokens[0];
    if( authType != "CB-HMAC" )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'Unknown authorization type ' + authType));

    // More HMAC checks
    var drift = new Date().getTime() - requestTime;
    if( Math.abs( drift ) > FIFTEEN_MINUTES )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'Too much drift: ' + drift + 'ms'));

    var kvset = asKVSet( tokens[1] );
    if( !kvset.headers )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'Missing headers list'));

    if( !isHmacAlgoValid(kvset.algo) )
        return next(new net.Error(net.ERROR_CODE_BAD_REQUEST,'Unsupported HMAC algo ' + kvset.algo));

    //
    // get the users/caller card public key from the mobido servers
    //

    // first check the cache
    if( DEBUG ) console.log( 'Getting user card public key' );
    var cacheKey = kvset.cid + '/' + kvset.ckid;
    if( kvset.tid )
        cacheKey += '/' + kvset.tid;
    var cardKey = cardPublicKeyCache.getItem(cacheKey);
    if( cardKey ) {
        if( DEBUG ) console.log( 'Using cached card public key for', cacheKey );
        return verifyWithKeys(req,authType,kvset,cardKey,botKeys,next); 
    }   

    // no luck in cache, so ask mobido server
    if( DEBUG ) console.log( 'Requesting card public key from server' );
    MWS.fetchCardPublicKey( mobidoAccessKey, kvset.cid, kvset.tid, kvset.ckid, function(err,result){
        if(err) {
            next(err);
        } else {
            var cardKey = result.crypto;
            cardKey.nickname = result.nickname;     // carry along nickname in cache
            cardPublicKeyCache.setItem( cacheKey, cardKey, { expirationSliding:180 } );
            if( DEBUG ) console.log( 'Caching card public key for', cacheKey );
            verifyWithKeys(req,authType,kvset,cardKey,botKeys,next);
        }
    });
}

function isHmacAlgoValid(algo) {
    return 'sha256' == algo;
}

var MODP_GROUPS = ['modp14','modp15','modp16'];
function isModpGroupValid(group) {
    return MODP_GROUPS.indexOf(group) > -1;
}

// cardkey = { id:'...', type:'modp14', values:[base64publickey] }
// botKey =  { id:'...', type:'dh1k', values:[base64publickey, base64privatekey] }
function createHmacSecret( cardKey, botKey ) {
    var modpGroup = cardKey.type;  // i.e. modp14
    var ref = crypto.getDiffieHellman(modpGroup);
    var dh = crypto.createDiffieHellman(ref.getPrime(),ref.getGenerator());

    var botPrivateKey = botKey.values[1];
    dh.setPrivateKey( botPrivateKey, 'base64' );
    var cardPublicKey = cardKey.values[0];
    var hmacSecret = dh.computeSecret( cardPublicKey, 'base64', 'base64' );

    return hmacSecret;
}

// next(err,isSecure)
// cardkey = { id:, type:'dh1k', values:[publickey,...], nickname: }
// botKeys: id => crypto map, i.e. { '2011-10-05T14:48:00.000Z': { type:'dh1k', values:[base64publickey, base64privatekey] }
function verifyWithKeys(req,authType,kvset,cardKey,botKeys,next) {
    if( DEBUG )
        console.log( 'Verify', kvset, 'with', cardKey, botKeys );

    // sanity check DH keys
    var modpGroup = cardKey.type;
    if( !isModpGroupValid( modpGroup ) )
        return next( new net.Error(net.ERROR_CODE_BAD_REQUEST, 'Unsupported DiffieHellman MODP group ' + modpGroup) );
    var botKey = botKeys[kvset.bkid];
    if( !botKey )   // send unauthorized so they can reset/refresh their keys
        return next( new net.Error(net.ERROR_CODE_UNAUTHORIZED, 'Invalid bot key id ' + kvset.bkid ) );    
    if( modpGroup != botKey.type )
        return next( new net.Error(net.ERROR_CODE_BAD_REQUEST, 'DiffieHellman MODP groups do not match: ' + modpGroup + ' != ' + botKey.type ) ); 

    var hmacSecret = createHmacSecret( cardKey, botKey );

    // start hashing...
    var hasher = crypto.createHmac(kvset.algo, hmacSecret);
    var hmac = req.hmac;

    // hash headers first
    var preamble = req.method + ' ' + req.originalUrl + '\n';
    var hlist = kvset.headers.split(';');
    for( var i = 0; i < hlist.length; i++ ){
        var name = clean( hlist[i] );
        var value = req.headers[name] + '\n';
        if( name == 'host' ) {
            value = value.toLowerCase();    // server is giving mixed case host names
        }
        preamble += value;
    }
    if( DEBUG ) console.log( 'Preamble is ' + preamble );
    hasher.update( preamble );

    // hash any body chunks we've cached up
    while( hmac.body.length > 0 ) {
        var chunk = hmac.body.shift();
        hasher.update( chunk );
        if( DEBUG ) console.log( 'Consuming chunk of ' + chunk.length + ' bytes' );
    }

    var sig = hasher.digest("base64");
    if( sig == kvset.sig ) {
        // SUCCESS! Signatures matched!!
        req.cid = kvset.cid;
        req.tid = kvset.tid;
        req.nickname = cardKey.nickname;    // convenience

        //if( DEBUG )
        console.log( 'Verified request from cid', req.cid, 'tid', req.tid, 'on', req.originalUrl );
    } else {
        console.log( 'Failed HMAC compare of', sig, 'to', kvset.sig, 'using secret', hmacSecret );
    }

    delete req.hmac; 
    next(null,req.cid ? true : false);
}

function trim (x) {
    return x && x.replace(/^\s+|\s+$/gm,'');
}

function clean(y) {
    return y && trim(y).toLowerCase();
}

function asKVSet( s )
{
    var result = {};
    s.split(',').forEach(function(x){
      var p = x.indexOf('=');
      if( p > -1 ) {
          var key = clean(x.substring(0,p));
          var value = trim(x.substring(p + 1));
          value && (result[key] = value);
      }
    });

    return result;
}