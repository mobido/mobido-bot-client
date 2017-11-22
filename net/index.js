const os = require('os');
const DEBUG = false;

// err is { message:"Details..."} or a string
exports.renderError = function(req,res,err) {
	var message = err.message? err.message : err;
	res.render('error',{message:message});
}

//===== New style error reporting =====

exports.signalNotOk = function(req,res,statusCode,message,details) {
	var err = { message:message, details:details };
    log(req,statusCode,err);
    res.status(statusCode).json({failure:err});
}

exports.signalError = function(req,res,err) {
	var statusCode = 500;	// assume generic internal server error
	if( err instanceof ServerError && err.statusCode ) {
    	statusCode = err.statusCode;
    }

    log(req,statusCode,err);
    res.status( statusCode ).json({failure:err});
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
