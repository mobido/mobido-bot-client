const fs = require('fs-extra');
const crypto = require('crypto');
const readline = require('readline');
const MWS = require('./index')

const DEBUG = process.env.DEBUG;
const modpGroup = 'modp15';

// make these global so we dont have to pass them around
var shimData = { users:[], bots:{} };
var accessKey;
var fetchAccessKeyResult;

var options = {
    static_pages_dir: "static_public"
};

// If there was a botname provided on the command line, make sure the bot is setup
const argv = process.argv;
if( argv.length > 1 ) {

    console.log( '__dirname', __dirname );

    const botname = argv[2].toLowerCase();
    if( botname.endsWith('bot') != true ) {
        console.log( "Expected second argument to be a bot name, ending in 'bot'" );
        return;
    }

    const name = botname.substring( 0, botname.length - 3 );
    console.log( 'Bot simple name is', name );

    // ensure bot module file exists
    var path = 'bot_modules/' + name;
    fs.ensureDirSync(path);
    path += '/' + name + 'Bot.js';
    if( fs.existsSync( path ) == false ) {
        console.log( 'Creating bot module', path );
        fs.copyFileSync( __dirname + '/templates/xBot.js', path );
    }

    // ensure bot static PUBLIC files are up
    path = options.static_pages_dir + '/a/' + name;
    fs.ensureDirSync(path);
    var manifest = path + '/manifest.json';
    if( fs.existsSync( manifest ) == false ) {
        console.log( 'Manifest missing; copying default webfiles' );
        fs.copySync( __dirname + '/templates/bot_webfiles', path );
    }

    // ensure common static files are up
    const filterFunc = (src, dest) => {
        var exists = fs.existsSync( dest );
        //console.log( 'Exists?', src, dest, exists );
        return !exists;
    };
    ['css','images','js'].forEach(function(type){
        var src = __dirname + '/templates/common_webfiles/common-'+type;
        var dest = options.static_pages_dir + '/common-' + type;
        fs.ensureDirSync(dest);
        fs.copySync( src, dest, filterFunc );
    });
}

// Prompt for login, and get accessKey
promptForLogin(function(email,password){
    MWS.fetchAccessKey({id:email,password:password},function(err,result){
        if( err )
            return console.log( 'ERROR: Problem fetching access key', err );
        
        if( DEBUG ) console.log( 'Login provided', result );
        fetchAccessKeyResult = result;
        delete fetchAccessKeyResult.created;
        accessKey = result.accessKey;

        MWS.fetchMyCards( accessKey, function(err,result){
            if( err )
                return console.log( 'ERROR: Problem fetching cards', err );
            
            if( DEBUG )
                console.log( 'My cards:', JSON.stringify(result.cards,null,'\t'));

            fetchCardKeys( result.cards, 0 );
        });
    });
});

function fetchCardKeys( cards, index ) {
    if( index >= cards.length ) {
        // all card keys have been fetched, so find user keys
        if( shimData.users.length == 0 )
            return console.log( 'No user cards found' );
        var cryptoMap = shimData.users[0].cryptos;
        var cryptoIds = Object.keys( cryptoMap );
        if( cryptoIds.length == 0 )
            return console.log( 'No crypto keys found for user' );

        // simply use first key (there should be only one)
        var userKey = cryptoMap[cryptoIds[0]];
        return setupBots( userKey );
    }

    var card = cards[index];
    var shim = { card: card };

    var nickname = card.nickname;
    if( nickname.endsWith('Bot') ) {
        var botname = nickname.substring( 0, nickname.length - 3 ).toLowerCase();
        shimData.bots[botname] = shim;
    } else
        shimData.users.push( shim );

    MWS.fetchPrivateKey( accessKey, card.cid, modpGroup, function(err,result) {
        if( err )
            return console.log( 'ERROR: Problem fetching card keys', err );

        var key = result.crypto;
        //console.log( 'Fetched user keys', userKey );
        shim.cryptos = {};
        shim.cryptos[key.id] = key;
        delete key.id;

        fetchCardKeys( cards, index + 1 );  // next carad
    });    
}

function setupBots( userKey ) {
    // find bot implementations from disk dirs
    var botNames = [];
    fs.readdirSync('./bot_modules').forEach(function(name) {
        if( name.indexOf('.') != 0 )
            botNames.push(name);
    });

    var botCids = [];
    setupEachBot( botNames, 0, userKey, botCids );
}

function setupEachBot( botNames, index, userKey, botCids ) {
    if( index >= botNames.length )
        return createTestThread( botCids );

    var name = botNames[index];
    var botShim = shimData.bots[name];
    if( !botShim ) {
        console.log( 'WARNING: Could not find ' + name + 'Bot on Mobido under your account. Did you forget to create it?' );
        return setupEachBot( botNames, index+1, userKey, botCids );
    }

    // cache private keys for bot server to use
    var filename = './bot_modules/' + name + '/mobido-private-keys.json';
    var body = { cryptos:botShim.cryptos };
    var json = JSON.stringify(body,null,'\t');
    fs.writeFileSync(filename,json);

    // find first public/private key
    var id = Object.keys(botShim.cryptos)[0];
    var botKey = botShim.cryptos[id];

    // make sure static web page directory exists
    var path = options.static_pages_dir + '/a/' + name;
    if( fs.existsSync( path ) == false )
        fs.mkdirSync( path );

    // strip out private keys and save for production use
    // The messenger clients use this
    botKey.values.splice(1);  // remove all but first value, which is the public key
    var filename = path + '/mobido-public-keys.json';
    var json = JSON.stringify(body,null,'\t');
    fs.writeFileSync(filename,json);

    // add info for shim to use
    //botShim.cryptos = botKeys;

    // precompute secret for user[0] and this bot
    botShim.hmacSecret = createHmacSecret( userKey, botKey );

    var botcid = botShim.card.cid
    botCids.push( botcid );

    // write the mobido server keys
    fetchAccessKeyResult.botcid = botcid;
    var filename = './bot_modules/' + name + '/mobido-server-keys.json'; 
    var json = JSON.stringify(fetchAccessKeyResult,null,'\t');
    fs.writeFileSync(filename,json);

    // on to next bot...
    setupEachBot( botNames, index+1, userKey, botCids );
}

function createTestThread( botCids ) {
    // Create thread for testing
    var WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var now = new Date();
    var minutes = now.getMinutes();
    if( minutes < 10 ) minutes = '0' + minutes;
    var subject = WEEKDAYS[now.getDay()] + ' ' + now.getHours() + ':' + minutes + ' Test'; 
    var cid = shimData.users[0].card.cid;
    if( DEBUG ) console.log( 'Creating test thread' );
    MWS.createThread( accessKey, { subject:subject, cid:cid }, function(err,result) {
        if( err )
            return console.log( 'Problem creating test thread', err );

        // add all the bots to this test thread
        addBotsToTestThread( result.thread.tid, cid, botCids, 0 );
    });
}

function addBotsToTestThread( tid, mycid, botCids, index ) {
    if( index >= botCids.length )
        return reloadTestThread( tid )

    var botcid = botCids[index];
    if( DEBUG ) console.log( 'Adding bot', botcid, 'to test thread' );
    MWS.addCardToThread( accessKey, tid, botcid, mycid, function(err,result) {
        if( err && err.code == 410 )
            console.log( 'WARNING: Failed to add bot to test thread.  Maybe it\'s not in the bot directory?' );
        else if( err )
            return console.log( 'Problem adding bot', botcid, 'to test thread', tid, err );

        // next!
        if( DEBUG ) console.log( 'Added bot', botcid );
        addBotsToTestThread( tid, mycid, botCids, index + 1 );
    });
}

function reloadTestThread( tid ) {
    if( DEBUG ) console.log( 'reloadTestThread()' );
    MWS.fetchThread( accessKey, tid, function(err,result) {
        if( err )
            return console.log( 'ERROR: Problem reloading test thread', err );

        shimData.thread = result.thread;
        writeShimData();   
    }); 
}

// Finally! Write shim data to a place the widget shim code can get it for testing
function writeShimData() {
    var path = options.static_pages_dir + '/dev';
    if( fs.existsSync( path ) == false )
        fs.mkdirSync( path );

    path += '/shim-data.json';
    json = JSON.stringify(shimData,null,'\t');  // tabs to be pretty/easy to read
    fs.writeFileSync(path,json);

    // make sure there's a .gitignore so it doesn't go to the public sebserver!
    path = options.static_pages_dir + '/dev/.gitignore';
    if( fs.existsSync( path ) == false )
        fs.writeFileSync(path,'shim-data.json');   

    console.log( 'Success!' );
}

//
// Utility
//

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

function ensureS3SimulatorDirectory() {
    var path = '~/mobido';
    if( !fs.existsSync( path ) ) {
        fs.mkdirSync( path )
    }
    path += '/s3simulator';
    if( !fs.existsSync( path ) ) {
        fs.mkdirSync( path )
    }    
}

// next(email,password)
function promptForLogin(next) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Mobido login email: ', (email) => {
        rl.question('Mobido login password: ', (password) => {
            next(email,password);
            rl.close();
        });
    });
}