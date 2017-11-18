const request = require('request');
const crypto = require('crypto');
const net = require('mobido-bot-client/net');

const ALT_MOBIDO_SERVER = process.env.ALT_MOBIDO_SERVER;
const MOBIDO_SERVER = ALT_MOBIDO_SERVER ? ALT_MOBIDO_SERVER : "http://m.mobido.com";
console.log( "Using Mobido server", MOBIDO_SERVER );

const DEBUG = true;

//var cache = {}; // 'authority/id' => { id:, secret: }

//
// REST endpoints that don't need security
//

// login { authority:'email', id:'you@domain.com', password:'secret'}
exports.fetchAccessKey = function(login,next) {
	if( !login.authority ) {
		// look for something@foo.bar, or *@*.*
		var emailHost = login.id.split('@');
		var isEmail = emailHost.length > 1 && emailHost[1].split('.').length > 1;
		login.authority = isEmail ? 'email' : 'username';
	}

	var url = MOBIDO_SERVER + '/v1/account/accessKey';
	var options = { method:'POST', url:url, headers:{}, json:login };
	
	request( options, function(err,res,bodyAsJson) {
		if( err )
			return next(err);
		if( res.statusCode != 200 ) {
			return next( new net.ServerError( res.statusCode, 'Failed to get access key (login) from Mobido server ' + url ) );
		}

		// add some debug info to result
    	bodyAsJson.created = (new Date).toISOString();
    	bodyAsJson.source = url;
    	bodyAsJson.id = login.id;

		next(null,bodyAsJson);
	});	
}

/* login { authority:'email', id:'you@domain.com', password:'secret'}
exports.invalidateAccessKey = function(login) {
	var key = cacheKey(login);
	delete cache[key];
}*/

// TODO use access key?
// result is { crypto:{ id:'...', type:'modp15', values:[publickey,...] } }
exports.fetchCardPublicKey = function( accessKey, cid, tid, pkid, next ) {
	var url = MOBIDO_SERVER + '/v1/cards/' + cid;
	if( tid )
		url += '/inthread/' + tid;
	url += '/publickeyid/' + pkid;
	var options = { url:url, headers:{} };

	if( DEBUG )
			console.log( 'Fetching card public key', options );
	
	request( options, function(err,res,body) {
		if( err )
			return next(err);
		if( res.statusCode != 200 ) {
			return next( new net.ServerError( res.statusCode, 'Failed to get card public key from Mobido server' + url ) );
		}

		var result = JSON.parse(body);
		if( DEBUG )
			console.log( 'Fetched', result, 'for card', cid );
		next(null,result);
	});
}

exports.fetchCardPublicKeyByType = function( accessKey, cid, tid, type, next ) {
	var url = MOBIDO_SERVER + '/v1/cards/' + cid;
	if( tid )
		url += '/inthread/' + tid;
	url += '/publickeytype/' + type;
	var options = { url:url, headers:{} };
	
	request( options, function(err,res,body) {
		if( err )
			return next(err);
		if( res.statusCode != 200 ) {
			return next( new net.ServerError( res.statusCode, 'Failed to get card public key from Mobido server' + url ) );
		}

		var result = JSON.parse(body);
		if( DEBUG )
			console.log( 'Fetched', result, 'for card', cid );
		next(null,result);
	});
}

// TODO @deprecated
exports.fetchBotPublicKeyByType = function( accessKey, cid, type, next ) {
	var url = MOBIDO_SERVER + '/v1/bots/' + cid  + '/publickeytype/' + type;
	var options = { url:url, headers:{} };
	
	request( options, function(err,res,body) {
		if( err )
			return next(err);
		if( res.statusCode != 200 ) {
			return next( new net.ServerError( res.statusCode, 'Failed to get bot public key from Mobido server' + url ) );
		}

		var result = JSON.parse(body);
		if( DEBUG )
			console.log( 'Fetched', result, 'for card', cid );
		next(null,result);
	});
}

//
// REST endpoints that need authentiation
//

// msg = { from:cid, tid:tid, body:body, meta: {} }
exports.sendMessage = function( accessKey, msg, next ) {
	secureJsonRequest( accessKey, 'POST', 'threads/' + msg.tid, msg, next );
}

exports.fetchMyCards = function( accessKey, next ) {
	secureJsonRequest( accessKey, 'GET', 'cards', null, next );
}

exports.fetchPrivateKey = function( accessKey, cid, type, next ) {
	secureJsonRequest( accessKey, 'GET', 'cards/' + cid + '/privatekey/' + type, null, next );
}

// thread1:  { subject: room name, cid:creatorcid }
// thread2:  { subject:, mycid:, contacts:[ {cid:,tids:[]} ] }
exports.createThread = function( accessKey, thread, next ) {
	secureJsonRequest( accessKey, 'POST', 'threads', thread, next );
}

exports.addCardToThread = function( accessKey, tid, addcid, mycid, next ) {
	var path = 'threads/' + tid + '/add/' + addcid + '/by/' + mycid;
	secureJsonRequest( accessKey, 'PUT', path, null, next );
}

exports.fetchThread = function( accessKey, tid, next ) {
	secureJsonRequest( accessKey, 'GET', 'threads/' + tid, null, next );
}

exports.fetchThreadCards = function( accessKey, tid, next ) {
	secureJsonRequest( accessKey, 'GET', 'threads/' + tid + '/cards', null, next );
}

exports.fetchCardInThread = function( accessKey, tid, cid, next ) {
	const path = 'cards/' + cid + '/inthread/' + tid;
	secureJsonRequest( accessKey, 'GET', path, null, next );
}

exports.fetchBotKey = function( accessKey, cid, type, next ) {
	secureJsonRequest( accessKey, 'GET', 'bots/' + cid + '/publickeytype/' + type, null, next );
}

//===== Utility =====

function cacheKey(login) {
	return login.authority + '/' + login.id;
}

// Method is GET, POST, etc.
// Path does NOT start with / it's always prefixed with http://www.mobido.com/v1/
function secureJsonRequest( accessKey, method, path, data, next ) {
	var url = MOBIDO_SERVER + '/v1/' + path;
	var json = data ? data : true;
	var options = { method:method, url:url, headers:{}, json:json };

	// add auth!
	hmac( accessKey, options, data );
	if( DEBUG) console.log( 'Sending', JSON.stringify(options));
	
	request( options, function(err,res,bodyAsJson) {
		if( err ) {
			next(err);
		} else if( res.statusCode != 200 ) {
			return next( new net.ServerError( res.statusCode, 'Failed to ' + options.method + ' ' + url ) );
		} else {
			if( DEBUG ) console.log( 'Response', res.headers );
			next(null,bodyAsJson);
		}
	});	
}

//
// HMAC support to mobido server
//

function hmac( accessKey, options, data ) {
    // make sure url is full path!
    var urltokens = options.url.split('/');

    // collect the header data
    var host = urltokens[2].toLowerCase();
    if( host.endsWith(':80') ) {
    	host = host.substring(0,host.length-3);
    }
    var date = new Date().toUTCString();
    var method = options.method;
    var path = options.url.substring( MOBIDO_SERVER.length );

    // create the preamble
    var preamble = method + ' ' + path + '\n' + host + '\n' + date + '\n';

    // start hashing...
    var hasher = crypto.createHmac('sha256', accessKey.secret );
    hasher.update(preamble);
    //if( options.body ) 
    if( data )
      hasher.update( JSON.stringify( data ) );
    var sig = hasher.digest("base64");

    var auth = 'HMAC-SHA256 id=' + accessKey.id + ',headers=Host;X-Mobido-Date,sig=' + sig;
    
    var headers = options.headers;
    headers['X-Mobido-Authorization'] = auth;
    headers['X-Mobido-Date'] = date;
}
