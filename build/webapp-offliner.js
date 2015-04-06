'use strict';

const { Ci } = require('chrome');

const OFFLINER_CLIENT_NAME = 'offliner-client';

const OFFLINER_INIT_NAME = 'offliner-init';

var utils = require('./utils');

var isResource = function(resource) {
  return ['.DS_Store', 'test-data'].indexOf(resource) === -1;
}

var WebappOffliner = function(options) {
  this.webapp = options.webapp;
  this.sharedFolder = utils.gaia.getInstance(options).sharedFolder;

  this.url = this.webapp.manifest.url;
  this.buildDirPath = this.webapp.buildDirectoryFilePath;
  this.buildDir = utils.getFile(this.buildDirPath);

  this.resources = [];
};

WebappOffliner.prototype.visitResources = function(source) {
  var files = source.directoryEntries;

  while (files.hasMoreElements()) {
    var file = files.getNext().QueryInterface(Ci.nsILocalFile);
    if (file.isDirectory()) {
      isResource(file.leafName) && this.visitResources(file);
    } else {
      if (isResource(file.leafName)) {
        this.resources.push(this.url +
                            file.path.replace(this.buildDirPath, ''));
      }
    }
  }
}

WebappOffliner.prototype.createResourcesFile = function() {
  this.visitResources(this.buildDir);
  var file = this.buildDir.clone();
  file.append('offliner-resources.js');
  utils.writeContent(file, 'off.resources = ' +
                            JSON.stringify(this.resources) +
                           ';');
}

WebappOffliner.prototype.addDateToWorker = function() {
  var file = utils.getFile(this.buildDirPath, 'offliner-worker.js');

  if (!file.exists()) {
    utils.log(file.path + 'does not exist!\n');
  }

  var content = utils.getFileContent(file);
  utils.writeContent(file, '// ' + Date.now() + content);
};

WebappOffliner.prototype.decorateLaunchPath = function() {
  var launchPath = this.webapp.manifest.launch_path || 'index.html';
  launchPath = launchPath.startsWith('/') ? launchPath.substring(1) :
                                            launchPath;

  var htmlFile = utils.getFile(this.buildDirPath, launchPath);

  if (!htmlFile.exists()) {
    utils.log(htmlFile.path + 'does not exist!\n');
  }

  var doc = utils.getDocument(utils.getFileContent(htmlFile));

  var fileNames = [OFFLINER_INIT_NAME, OFFLINER_CLIENT_NAME];

  fileNames.forEach(fileName => {
    this.prependElement(doc, {
      fileType: 'script',
      attrs: {
        src: fileName + '.js',
        type: 'text/javascript'
      }
    });
  });

  var str = utils.serializeDocument(doc);
  utils.writeContent(htmlFile, str);
};

WebappOffliner.prototype.prependElement = function(doc, data) {
  var file = doc.createElement(data.fileType);

  for (var attr in data.attrs) {
    file[attr] = data.attrs[attr];
  }

  doc.head.insertBefore(file, doc.head.firstElementChild);
};

WebappOffliner.prototype.copyServiceWorkerFiles = function() {
  var swDir = utils.getFile(this.sharedFolder.path, 'js', 'offliner');
  utils.copyDirTo(swDir, utils.dirname(this.buildDirPath),
                  utils.basename(this.buildDirPath), true);
};

WebappOffliner.prototype.execute = function() {
  // 1) Create offline-resources.js which lists all resources of our app
  this.createResourcesFile();
  // 2) Copy all files in '/shared/js/offliner' to root folder
  this.copyServiceWorkerFiles();
  // 3) Write current date to worker
  this.addDateToWorker();
  // 4) Add offliner-setup's link in the launch HTML page
  this.decorateLaunchPath();
};

function execute(options) {
  var webapp = options.webapp;
  webapp.manifest.type === 'trusted' && (new WebappOffliner(options)).execute();
}

exports.execute = execute;
