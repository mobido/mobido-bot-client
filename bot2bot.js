const MWS = require('./mobidoWebService');
const request = require('request');
const crypto = require('crypto');
const net = require('./net');
const url = require('url');

const BOT_SERVER = process.env.BOT_SERVER ? process.env.BOT_SERVER : "http://bots.mobido.com";
console.log( "Using Mobido bot server", BOT_SERVER );

const DEBUG = true;


// Needs
//   my bot cid
//   my private keys
//   other bot cid
//   tid
// Process
// 1) Get other bot public keys and url (if not locally cached)
// 2) Create shared secret
// 3) send request
exports.secureJsonRequest = function( myCid, myKeys, peerCid, tid, method, path, data, next ) {
	var keyIds = Object.keys( myKeys );
	var myKey = myKeys[keyIds[0]];
	myKey.id = keyIds[0];
	var type = myKey.type;

	MWS.fetchBotPublicKeyByType( null, peerCid, type, function(err,result) {
		if( err )
			return next(err);

		if( DEBUG )
			console.log( 'fetchBotPublicKeyByType()=', JSON.stringify(result));

		var resturl = resolveBotUrl( result.url, path );
		var json = data ? data : true;
		var options = { method:method, url:resturl, headers:{}, json:json };

		// add auth!
		var peerKey = result.crypto;
		hmac( myCid, myKey, peerKey, tid, options, data );
		if( DEBUG)
			console.log( 'secureJsonRequest', JSON.stringify(options));
		
		request( options, function(err,res,bodyAsJson) {
			if( err ) {
				next(err);
			} else if( res.statusCode != 200 ) {
				next( new net.ServerError( res.statusCode, 'Failed to ' + options.method + ' ' + resturl ) );
			} else {
				if( DEBUG ) console.log( 'Response', res.headers );
				next(null,bodyAsJson);
			}
		});	
	});
}

function resolveBotUrl( boturl, path ) {
	var lower = boturl.toLowerCase();
	if( lower.indexOf( 'http:') == 0 || lower.indexOf('https:') == 0 )
		return url.resolve( boturl, path );

	// use production servers?
	var shortname = boturl;
	var base = BOT_SERVER + '/a/' + shortname + '/';
	return url.resolve( base, path );

	/* otherwise modify the non-default mobido server url to use port 3001
	var apiurl = url.parse( MOBIDO_SERVER );
	var base = apiurl.protocol + '//' + apiurl.hostname + ':3001/a/' + shortname + '/';
	console.log( 'Using dev botserver url', base );
	return url.resolve( base, path );
	*/
}

function createDiffieHellmanKey(modpGroup) {
    var dh = crypto.getDiffieHellman(modpGroup);
    var publicKey = dh.generateKeys('base64');
    var privateKey = dh.getPrivateKey('base64');

    var dhk = { type:modpGroup, values:[ publicKey, privateKey ] };

    return dhk;
}

function createHmacSecret( cardKey, botKey ) {
    var modpGroup = cardKey.type;  // i.e. modp14
    var ref = crypto.getDiffieHellman(modpGroup);
    var dh = crypto.createDiffieHellman(ref.getPrime(),ref.getGenerator());

    var cardPrivateKey = cardKey.values[1];
    dh.setPrivateKey( cardPrivateKey, 'base64' );
    var botPublicKey = botKey.values[0];
    var hmacSecret = dh.computeSecret( botPublicKey, 'base64', 'base64' );

    return hmacSecret;
}


//
// CB-HMAC support to other bot server
//

function hmac( cid, myKey, peerKey, tid, options, data ) {
    // make sure url is full path!
    var urltokens = options.url.split('/');

    // collect the header data
    var host = urltokens[2].toLowerCase();
    if( host.endsWith(':80') ) {
    	host = host.substring(0,host.length-3);
    }
    var date = new Date().toUTCString();
    var method = options.method;
    //var path = options.url.substring( MOBIDO_SERVER.length );
    var path = url.parse( options.url ).path;

    // create the preamble
    var preamble = method + ' ' + path + '\n' + host + '\n' + date + '\n';

    // start hashing...
	var secret = createHmacSecret( myKey, peerKey );
    var hasher = crypto.createHmac('sha256', secret );
    hasher.update(preamble);
    //if( options.body ) 
    if( data )
      hasher.update( JSON.stringify( data ) );
    var sig = hasher.digest("base64");

    //var auth = 'HMAC-SHA256 id=' + accessKey.id + ',headers=Host;X-Mobido-Date,sig=' + sig;
    var auth = 'CB-HMAC algo=sha256,cid=' + cid + ',tid=' + tid + ',ckid=' + myKey.id + ',bkid=' + peerKey.id + ',headers=Host;X-Mobido-Date,sig=' + sig;

    var headers = options.headers;
    headers['X-Mobido-Authorization'] = auth;
    headers['X-Mobido-Date'] = date;

    // while in Beta, always include this
	//headers['Authorization'] = 'Basic ZHJpbms6Y29rZQ==';
}
