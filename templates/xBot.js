const hmac = require('mobido-bot-client/cb-hmac');
const net = require('mobido-bot-client/net');
const MWS = require('mobido-bot-client');

const privateKeys = require('./mobido-private-keys');
const botKeys = privateKeys.cryptos;
const mobidoServerKeys = require('./mobido-server-keys');
const mobidoAccessKey = mobidoServerKeys.accessKey;
const botcid = mobidoServerKeys.botcid;

module.exports = function( express )
{
	var router = express.Router();

	//
	// PUBLIC endpoints!!
	//

	router.get('/status',function(req,res){
		res.json({status:"Great!"});
	});

	// validate request with HMAC and my bot key
	router.use(function(req, res, next) {		
		hmac.isSecure( req, mobidoAccessKey, botKeys, function(err,secure) {
			if(err)
				net.signalError(req,res,err);
			else if( !secure )
				net.signalError(req,res,401,'Requires authentication');
			else
				next();
		});
	});

	//
	// Secure endpoints...
	//

	// Look for messages formatted as #<number> (or just number)
	router.post('/webhook', function(req, res) {
		var msg = req.body;
		console.log( 'WEBHOOK from cid', req.cid, 'in tid', req.tid, 'of', msg );
		return res.json({});
	});

	return router;
}