function trim (x) {
    return x && x.replace(/^\s+|\s+$/gm,'');
}

function clean(y) {
    return y && trim(y).toLowerCase();
}

exports.trim = trim;
exports.clean = clean;

exports.asKVSet = function( s )
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