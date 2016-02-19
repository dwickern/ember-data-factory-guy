/* global requirejs, require */
/*jslint node: true */

export default function () {
  let factoryFileRegExp = new RegExp('/tests/factories');

  Object.keys(requirejs._eak_seen).filter(function (key) {
    return factoryFileRegExp.test(key);
  }).forEach(function (moduleName) {
    if (moduleName.match('.jshint')) { // ignore autogenerated .jshint files
      return;
    }
    if (moduleName.match('.jscs')) { // ignore autogenerated .jscs files
      return;
    }
    require(moduleName, null, null, true);
  });
}