// endpoints used only for development and in conjunction
// with the bot widget shim
//
// To use these endpints, set the ALT_MOBIDO_SERVER env variable to http://localhost:3001
// ex:
//	$ ALT_MOBIDO_SERVER=http://localhost:3001 node server.js

// load shim data if available
// Shim data SHOULD NOT exist on production systems!
// Use .gitignore to make sure shim-data.json is not packaged and sent to servers!

try {
    var shimData = require( '../static/dev/shim-data' );
    console.log( 'Shim data loaded' );
} catch(err) {
    console.log( 'No shim data found for dev, OK to be missing in production', err );
}

module.exports = function( express )
{
	var router = express.Router();

	router.get('/v1/cards/:cid/inthread/:tid/publickeyid/:pkid', function(req, res) {
        if( !shimData ) {
            console.log( 'Shim data not available for fake public key call');
            res.status(500).send('Shim data not available');
            return;
        }

	    var params = req.params;
        var user = findUser( params.cid );
        if( !user ) {
            console.log('Failed to find card by id');
            return res.status(410).send('Failed to find card by id');    
        }
    	if( params.cid == user.card.cid && params.tid == shimData.thread.tid ) {
        	var c = user.cryptos[params.pkid];
        	if( c ) {
        		var pubonly = { type:c.type, values:[c.values[0]] };
        		return res.json( { crypto:pubonly, nickname:user.card.nickname } );
        	}
    	}	

        console.log('Failed to find public key by id');
    	res.status(410).send('Failed to find public key by id');
	});

    router.post('/v1/threads/:tid', function(req, res) {
        console.log( 'Simulating POST thread endpoint, tid:', req.params.tid );
        res.json({});
    });

    router.get('/v1/bots/:cid/publickeytype/:type', function(req,res){
        if( !shimData ) {
            console.log( 'Shim data not available for fake public key by type call');
            res.status(404).send('Shim data not available');
            return;
        }

        var cid = req.params.cid;
        var type = req.params.type;

        // find bot
        for( var name in shimData.bots ) {
            if( shimData.bots.hasOwnProperty( name ) ) {
                var bot = shimData.bots[name];
                if( bot.card.cid == cid ) {
                    //console.log( 'Found bot', bot );

                    // search for key of 'type'
                    for( var id in bot.cryptos ) {
                        var c = bot.cryptos[id];
                        if( c.type == type ) {
                            c.id = id;
                            return res.json( { url:name, crypto:c, nickname:bot.card.nickname } );
                        }
                    }

                    console.log( 'Failed to find key of type:', type );
                    return res.status(410).send( 'Failed to find key of type:' + type );
                } 
            }
        }

        console.log( 'Failed to find bot with cid', cid );
        res.status(410).send('Failed to find bot');
    });

	return router;
}

function findUser(cid) {
    // first look through users
    var users = shimData.users;
    for( var i = 0; i < users.length; i++ ) {
        if( users[i].card.cid == cid )
            return users[i];
    }

    // then search through bots
    var bots = shimData.bots;
    var botNames = Object.keys(bots);
    for( var i = 0; i < botNames.length; i++ ) {
        var name = botNames[i];
        if( bots[name].card.cid == cid )
            return bots[name];
    }

    // failed to find user/bot...
}
