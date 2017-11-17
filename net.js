const os = require('os');
const DEBUG = false;

// err is { message:"Details..."} or a string
exports.renderError = function(req,res,err) {
	var message = err.message? err.message : err;
	res.render('error',{message:message});
}

// err = {code:500,message:'Cant access db',details:['Authentication error']}
// - or -
// err = 500,message = 'Cant access db',details = ['problem1','problem2'...]
exports.signalError = function(req,res,err,message,details) {
    if( message ) err = { code:err, message:message };
    if( details ) err.details = details;
    if( !err.code ) err.code = 500;
    log(req,err.code,err);
    res.status(err.code).json(err);
}

exports.Error = function(code,message,details) {
	this.code = code;
	if( message ) this.message = message;
	if( details ) this.details = details;
}

//===== New style error reporting =====

exports.signalNotOk = function(req,res,statusCode,message,details) {
	var err = { message:message, details:details };
    log(req,statusCode,err);
    res.status(statusCode).json(err);
}

exports.signalError2 = function(req,res,err) {
	var statusCode = 500;	// assume generic internal server error
	if( err instanceof ServerError && err.statusCode ) {
    	statusCode = err.statusCode;
    }

    log(req,statusCode,err);
    res.status( statusCode ).json(err);
}

function ServerError(statusCode,message,details) {
	Error.captureStackTrace(this, this.constructor);
	this.name = this.constructor.name;

	this.statusCode = statusCode;
	this.message = message;
	this.details = details;
}
require('util').inherits(ServerError, Error);
exports.ServerError = ServerError;

function log(req,statusCode,err) {
    console.log( new Date(), 'ERROR:', { statusCode:statusCode, url:req.originalUrl, headers:req.headers, cid:req.cid, tid:req.tid, body:req.body }, JSON.stringify(err) );
}

//===== HTTP status codes =====

exports.ERROR_CODE_BAD_REQUEST = 400;		// request is malformed or invalid, missing headers, etc.
exports.ERROR_CODE_UNAUTHORIZED = 401;		// client should retry with authorization header
exports.ERROR_CODE_FORBIDDEN = 403;			// You are no longer allowed to access this specific information
											// ex: you have left a thread but want to access cards
exports.ERROR_CODE_NOT_FOUND = 404;			// REST endpoint was invalid
											// NOTE: use 410 for resources that could not be found
exports.ERROR_CODE_CONFLICT = 409;			// a precondition failed, like trying to pair
											// two of my own cards
exports.ERROR_CODE_GONE = 410;				// the might have existed, but no longer. Ex: an RSVP expiring
											// an accesskey being invalidated, or thread being deleted

exports.ERROR_CODE_NOT_SUPPORTED = 411;		// Function is not supported (yet)	
exports.ERROR_UNPROCESSABLE_ENTITY = 422;	// Parameters in request are semantically erroneous									
exports.ERROR_CODE_SERVER_FAILURE = 500;	// server side problem, not an issue with client request
exports.ERROR_CODE_SERVICE_UNAVAILABLE = 503;	// a dependent server was unavailable

exports.getRemoteAddress = function(req) {
	var ip = req.headers['x-forwarded-for'];
	if( ip )
		return ip;
	else
		return req.connection.remoteAddress;
}

exports.getLocalAddresses = function() {

	var ifaces = os.networkInterfaces();
	var result = {};

	Object.keys(ifaces).forEach(function (ifname) {
	  var alias = 0;

	  ifaces[ifname].forEach(function (iface) {
	    if ('IPv4' !== iface.family || iface.internal !== false) {
	      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
	      return;
	    }

	    var name = alias >= 1 ? ifname + ':' + alias : ifname;
	   	console.log(name, iface.address);
	    result[name] = iface.address;

	    ++alias;
	  });
	});

	return result;
}

exports.getClusterAddress = function() {
	var addresses = exports.getLocalAddresses();

	console.log( 'Cluster addresses are', JSON.stringify( addresses ) );

	var result;
	Object.keys(addresses).forEach(function(key){
		var addr = addresses[key];
		if( hasPrefix( addr, ['192.168.','172.31.','172.16.','10.'] ) )
			result = addr;
	});

	if( !result ) {
		console.log( 'Failed to find cluster address from', JSON.stringify( addresses ) );
	}

	return result;
}

function hasPrefix( s, prefix ) {
	for( var i = 0; i < prefix.length; i++ ) {
		if( s.indexOf( prefix[i] ) == 0 )
			return true;
	}

	return false;
}

exports.isProduction = function() {
	var addr = exports.getClusterAddress();
	if( addr )
		return hasPrefix( addr, ['172.31.','172.16.','10.'] );

	console.log( 'ERROR: Failed to get network address.  This should only heppen in dev, so assume dev' );
	return false;
}

exports.isLocalRequest = function(req) {
	var conn = req.connection;
	var local = conn.address();
	var remote = conn.remoteAddress;

	if( local && local.address == remote ) {
		if( DEBUG ) console.log( new Date(), 'isLocalRequest(true): ',local,'==',remote );
		return true;
	} else {
		if( DEBUG ) console.log( new Date(), 'isLocalRequest(false): ',local,'!=',remote );
		return false;
	}
}

exports.isForwardWithinVpc = function(req) {
	var ipList = req.headers['x-forwarded-for'];
	if( !ipList )
		return false;

	var isLocal = false;
	ipList.split(',').forEach(function(e){
		var addr = e.trim();
		if( hasPrefix( addr, ['172.31.','172.16.','10.'] ) ) {
			isLocal = true;
		}
	});

	return isLocal;
}
