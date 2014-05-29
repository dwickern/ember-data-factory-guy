Sequence = function (fn) {
  var index = 1;

  this.next = function () {
    return fn.call(this, index++);
  }

  this.reset = function () {
    index = 1;
  }
};

function MissingSequenceError(message) {
  this.toString = function() { return message }
};

/**
 A ModelDefinition encapsulates a model's definition

 @param model
 @param config
 @constructor
 */
ModelDefinition = function (model, config) {
  var sequences = {};
  var defaultAttributes = {};
  var namedModels = {};
  var modelId = 1;
  this.model = model;

  /**
   @param {String} name model name like 'user' or named type like 'admin'
   @returns {Boolean} true if name is this definitions model or this definition
   contains a named model with that name
   */
  this.matchesName = function (name) {
    return model == name || namedModels[name];
  }

  // TODO
  this.merge = function (config) {
  }

  /**
   Call the next method on the named sequence function

   @param {String} sequenceName
   @returns {String} output of sequence function
   */
  this.generate = function (sequenceName) {
    var sequence = sequences[sequenceName];
    if (!sequence) {
      throw new MissingSequenceError("Can not find that sequence named [" + sequenceName + "] in '" + model + "' definition")
    }
    return sequence.next();
  }

  /**
   Build a fixture by name

   @param {String} name fixture name
   @param {Object} opts attributes to override
   @returns {Object} json
   */
  this.build = function (name, opts) {
    var modelAttributes = namedModels[name] || {};
    // merge default, modelAttributes and opts to get the rough fixture
    var fixture = $.extend({}, defaultAttributes, modelAttributes, opts);
    // deal with attributes that are functions or objects
    for (attribute in fixture) {
      if (Ember.typeOf(fixture[attribute]) == 'function') {
        // function might be a sequence of a named association
        fixture[attribute] = fixture[attribute].call(this, fixture);
      } else if (Ember.typeOf(fixture[attribute]) == 'object') {
        // if it's an object it's for a model association, so build the json
        // for the association and replace the attribute with that json
        fixture[attribute] = FactoryGuy.build(attribute, fixture[attribute])
      }
    }
    // set the id, unless it was already set in opts
    if (!fixture.id) {
      fixture.id = modelId++;
    }
    return fixture;
  }

  /**
   Build a list of fixtures

   @param name model name or named model type
   @param number of fixtures to build
   @param opts attribute options
   @returns array of fixtures
   */
  this.buildList = function (name, number, opts) {
    var arr = [];
    for (var i = 0; i < number; i++) {
      arr.push(this.build(name, opts))
    }
    return arr;
  }

  // Set the modelId back to 1, and reset the sequences
  this.reset = function () {
    modelId = 1;
    for (name in sequences) {
      sequences[name].reset();
    }
  }

  var parseDefault = function (object) {
    if (!object) {
      return
    }
    defaultAttributes = object;
  }

  var parseSequences = function (object) {
    if (!object) {
      return
    }
    for (sequenceName in object) {
      var sequenceFn = object[sequenceName];
      if (typeof sequenceFn != 'function') {
        throw new Error('Problem with [' + sequenceName + '] sequence definition. Sequences must be functions')
      }
      object[sequenceName] = new Sequence(sequenceFn);
    }
    sequences = object;
  }

  var parseConfig = function (config) {
    parseSequences(config.sequences);
    delete config.sequences;

    parseDefault(config.default);
    delete config.default;

    namedModels = config;
  }

  // initialize
  parseConfig(config);
}
FactoryGuy = {
  modelDefinitions: {},

  /**
   ```javascript

   Person = DS.Model.extend({
     type: DS.attr('string'),
     name: DS.attr('string')
   })

   FactoryGuy.define('person', {
     sequences: {
       personName: function(num) {
         return 'person #' + num;
       },
       personType: function(num) {
         return 'person type #' + num;
       }
     },
     default: {
       type: 'normal',
       name: FactoryGuy.generate('personName')
     },
     dude: {
       type: FactoryGuy.generate('personType')
     },
   });

   ```

   For the Person model, you can define named fixtures like 'dude' or
   just use 'person' and get default values.

   And to get those fixtures you would call them this way:

   FactoryGuy.build('dude') or FactoryGuy.build('person')

   @param {String} model the model to define
   @param {Object} config your model definition
   */
  define: function (model, config) {
    if (this.modelDefinitions[model]) {
      this.modelDefinitions[model].merge(config);
    } else {
      this.modelDefinitions[model] = new ModelDefinition(model, config);
    }
  },

  /**
   Used in model definitions to declare use of a sequence. For example:

   ```

   FactoryGuy.define('person', {
     sequences: {
       personName: function(num) {
         return 'person #' + num;
       }
     },
     default: {
       name: FactoryGuy.generate('personName')
     }
   });

   ```

   @param   {String} sequenceName
   @returns {Function} wrapper function that is called by the model
            definition containing the sequence
   */
  generate: function (sequenceName) {
    return function () {
      return this.generate(sequenceName);
    }
  },

  /**
   Used in model definitions to define a belongsTo association attribute.
   For example:

    ```
     FactoryGuy.define('project', {
       default: {
         title: 'Project'
       },
       project_with_admin: {
         // for named association, use this FactoryGuy.association helper method
         user: FactoryGuy.association('admin')
       }

    ```

   @param   {String} fixture name
   @returns {Function} wrapper function that will build the association json
   */
  association: function (fixtureName, opts) {
    return function () {
      return FactoryGuy.build(fixtureName, opts);
    }
  },

  /**
    Given a fixture name like 'person' or 'dude' determine what model this name
    refers to. In this case it's 'person' for each one.

   @param {String} name a fixture name could be model name like 'person'
          or a named person in model definition like 'dude'
   @returns {String} model name associated with fixture name or undefined if not found
   */
  lookupModelForFixtureName: function (name) {
    var definition = this.lookupDefinitionForFixtureName(name);
    if (definition) { return definition.model; }
  },

  /**

   @param {String} name a fixture name could be model name like 'person'
          or a named person in model definition like 'dude'
   @returns {ModelDefinition} ModelDefinition associated with model or undefined if not found
   */
  lookupDefinitionForFixtureName: function (name) {
    for (model in this.modelDefinitions) {
      var definition = this.modelDefinitions[model];
      if (definition.matchesName(name)) {
        return definition;
      }
    }
  },


  /**
   Build fixtures for model or specific fixture name. For example:

   FactoryGuy.build('user') for User model
   FactoryGuy.build('bob') for User model with bob attributes

   @param {String} name Fixture name
   @param {Object} opts Options that will override default fixture values
   @returns {Object} json fixture
   */
  build: function (name, opts) {
    var definition = this.lookupDefinitionForFixtureName(name);
    if (!definition) {
      throw new Error("Can't find that factory named [" + name + "]");
    }
    return definition.build(name, opts);
  },

  /**
   Build list of fixtures for model or specific fixture name. For example:

   FactoryGuy.buildList('user', 2) for 2 User models
   FactoryGuy.build('bob', 2) for 2 User model with bob attributes

   @param {String} name fixture name
   @param {Number} number number of fixtures to create
   @param {Object} opts options that will override default fixture values
   @returns {Array} list of fixtures
   */
  buildList: function (name, number, opts) {
    var definition = this.lookupDefinitionForFixtureName(name);
    if (!definition) {
      throw new Error("Can't find that factory named [" + name + "]");
    }
    return definition.buildList(name, number, opts);
  },

  /**
   TODO: This is kind of problematic right now .. needs work

   Clear model instances from FIXTURES array, and from store cache.
   Reset the id sequence for the models back to zero.
  */
  resetModels: function (store) {
    for (model in this.modelDefinitions) {
      var definition = this.modelDefinitions[model];
      definition.reset();
      try {
        var modelType = store.modelFor(definition.model);
        if (store.usingFixtureAdapter()) {
          modelType.FIXTURES = [];
        }
        store.unloadAll(modelType);
      } catch (e) {
      }
    }
  },

  /**
   Push fixture to model's FIXTURES array.
   Used when store's adapter is a DS.FixtureAdapter.

   @param {DS.Model} modelClass
   @param {Object} fixture the fixture to add
   @returns {Object} json fixture data
   */
  pushFixture: function (modelClass, fixture) {
    if (!modelClass['FIXTURES']) {
      modelClass['FIXTURES'] = [];
    }
    modelClass['FIXTURES'].push(fixture);
    return fixture;
  },

  /**
   Clears all model definitions
  */
  clear: function (opts) {
    if (!opts) {
      this.modelDefinitions = {};
    }
  }
}
DS.Store.reopen({
  /**
   @returns {Boolean} true if store's adapter is DS.FixtureAdapter
   */
  usingFixtureAdapter: function () {
    var adapter = this.adapterFor('application');
    return adapter instanceof DS.FixtureAdapter;
  },

  /**
   Make new fixture and save to store. If the store is using FixtureAdapter,
   will push to FIXTURE array, otherwise will use push method on adapter.

   @param {String} name name of fixture
   @param {Object} options fixture options
   @returns {Object|DS.Model} json or record depending on the adapter type
   */
  makeFixture: function (name, options) {
    var modelName = FactoryGuy.lookupModelForFixtureName(name);
    var fixture = FactoryGuy.build(name, options);
    var modelType = this.modelFor(modelName);

    if (this.usingFixtureAdapter()) {
      this.setAssociationsForFixtureAdapter(modelType, modelName, fixture);
      return FactoryGuy.pushFixture(modelType, fixture);
    } else {
      var store = this;
      var model;
      Em.run(function () {
        store.findEmbeddedBelongsToAssociationsForRESTAdapter(modelType, fixture);
        if (fixture.type) {
          // assuming its polymorphic if there is a type attribute
          // is this too bold an assumption?
          modelName = fixture.type.underscore();
        }
        model = store.push(modelName, fixture);
        store.setAssociationsForRESTAdapter(modelType, modelName, model);
      });
      return model;
    }
  },

  /**
   Make a list of Fixtures

   @param {String} name name of fixture
   @param {Number} number number to create
   @param {Object} options fixture options
   @returns {Array} list of json fixtures or records depending on the adapter type
   */
  makeList: function (name, number, options) {
    var arr = [];
    for (var i = 0; i < number; i++) {
      arr.push(this.makeFixture(name, options))
    }
    return arr;
  },

  /**
   Set the hasMany and belongsTo associations for FixtureAdapter.

   For example, assuming a user hasMany projects, if you make a project,
   then a user with that project in the users list of project, then this method
   will go back and set the user.id on each project that the user hasMany of,
   so that the project now has the belongsTo user association setup.
   As in this scenario:

   ```js
   var projectJson = store.makeFixture('project');
   var userJson = store.makeFixture('user', {projects: [projectJson.id]});
   ```

   Or if you make a project with a user, then set this project in
   the users list of 'projects' it hasMany of. As in this scenario:

   ```js
   var userJson = store.makeFixture('user');
   var projectJson = store.makeFixture('project', {user: userJson.id});
   ```

   @param {DS.Model} modelType model type like User
   @param {String} modelName model name like 'user'
   @param {Object} fixture to check for needed association assignments
   */
  setAssociationsForFixtureAdapter: function(modelType, modelName, fixture) {
    var self = this;
    var adapter = this.adapterFor('application');
    Ember.get(modelType, 'relationshipsByName').forEach(function (name, relationship) {
      if (relationship.kind == 'hasMany') {
        if (fixture[relationship.key]) {
          fixture[relationship.key].forEach(function(id) {
            var hasManyfixtures = adapter.fixturesForType(relationship.type);
            var fixture = adapter.findFixtureById(hasManyfixtures, id);
            fixture[modelName] = fixture.id;
          })
        }
      }

      if (relationship.kind == 'belongsTo') {
        var belongsToRecord = fixture[relationship.key];
        if (belongsToRecord) {
          if (typeof belongsToRecord == 'object') {
            FactoryGuy.pushFixture(relationship.type, belongsToRecord);
            fixture[relationship.key] = belongsToRecord.id;
          }
          var hasManyName = self.findHasManyRelationshipNameForFixtureAdapter(relationship.type, relationship.parentType);
          var belongsToFixtures = adapter.fixturesForType(relationship.type);
          var belongsTofixture = adapter.findFixtureById(belongsToFixtures, fixture[relationship.key]);
          if (!belongsTofixture[hasManyName]) {
            belongsTofixture[hasManyName] = []
          }
          belongsTofixture[hasManyName].push(fixture.id);
        }
      }
    })
  },

  /**
   Before pushing the fixture to the store, do some preprocessing.

   If its a belongs to association, and the fixture has an object there,
    then push that model to the store and set the id of that new model
    as the attribute value in the fixture

   If it's a hasMany association, and its polymorphic, then convert the
    attribute value to a polymorphic style

   @param modelType
   @param fixture
   */
  findEmbeddedBelongsToAssociationsForRESTAdapter: function (modelType, fixture) {
    var store = this;
    Ember.get(modelType, 'relationshipsByName').forEach(function (name, relationship) {
      if (relationship.kind == 'belongsTo') {
        var belongsToRecord = fixture[relationship.key];
        if (Ember.typeOf(belongsToRecord) == 'object') {
          belongsToRecord = store.push(relationship.type, belongsToRecord);
          fixture[relationship.key] = belongsToRecord;
        }
      }
    })
  },

  /**
   For the REST type models:

   For example if a user hasMany projects, then set the user
   on each project that the user hasMany of, so that the project
   now has the belongsTo user association setup. As in this scenario:

   ```js
   var project = store.makeFixture('project');
   var user = store.makeFixture('user', {projects: [project]});
   ```

   Or if you make a user, then a project with that user, then set the project
   in the users list of 'projects' it hasMany of. As in this scenario:

   ```js
   var user = store.makeFixture('user');
   var project = store.makeFixture('project', {user: user});
   ```

   @param {DS.Model} modelType model type like 'User'
   @param {String} modelName model name like 'user'
   @param {DS.Model} model model to check for needed association assignments
   */
  setAssociationsForRESTAdapter: function (modelType, modelName, model) {
    var self = this;
    Ember.get(modelType, 'relationshipsByName').forEach(function (name, relationship) {
      if (relationship.kind == 'hasMany') {
        var children = model.get(name) || [];
        children.forEach(function (child) {
          child.set(modelName, model)
        })
      }

      if (relationship.kind == 'belongsTo') {
        var belongsToRecord = model.get(name);
        var setAssociation = function() {
          var hasManyName = self.findHasManyRelationshipName(
            belongsToRecord.constructor,
            model
          )
          if (hasManyName) {
            belongsToRecord.get(hasManyName).addObject(model);
          }
        }
        if (belongsToRecord) {
          if (belongsToRecord.then) {
            belongsToRecord.then(function(record) {
              belongsToRecord = record;
              setAssociation();
            })
          } else {
            setAssociation();
          }
        }
      }
    })
  },

  findHasManyRelationshipName: function (belongToModelType, childModel) {
    var relationshipName;
    Ember.get(belongToModelType, 'relationshipsByName').forEach(
      function (name, relationship) {
        if (relationship.kind == 'hasMany' &&
          childModel instanceof relationship.type) {
          relationshipName = relationship.key;
        }
      }
    )
    return relationshipName;
  },

  findHasManyRelationshipNameForFixtureAdapter: function (belongToModelType, childModelType) {
    var relationshipName;
    Ember.get(belongToModelType, 'relationshipsByName').forEach(
      function (name, relationship) {
        if (relationship.kind == 'hasMany' &&
          childModelType == relationship.type) {
          relationshipName = relationship.key;
        }
      }
    )
    return relationshipName;
  },

  /**
   Adding a pushPayload for FixtureAdapter, but using the original with
   other adapters that support pushPayload.

   @param {String} type
   @param {Object} payload
   */
  pushPayload: function (type, payload) {
    if (this.usingFixtureAdapter()) {
      var model = this.modelFor(modelName);
      FactoryGuy.pushFixture(model, payload);
    } else {
      this._super(type, payload);
    }
  }
});


DS.FixtureAdapter.reopen({

  /**
   Overriding createRecord to add the record created to the
   hashMany records for all of the records that this record belongsTo.

   For example:

   If models are defined like so:

   User = DS.Model.extend({
       projects: DS.hasMany('project')
     })

   Project = DS.Model.extend({
       user: DS.belongsTo('user')
     })

   and you create a project record with a user defined:
    store.createRecord('project', {user: user})

   this method will take the new project created and add it to the user's 'projects'
   hasMany array.

   And a full code example:

   var userJson = store.makeFixture('user');

   store.find('user', userJson.id).then(function(user) {
       store.createRecord('project', {user: user}).save()
         .then( function(project) {
           // user.get('projects.length') == 1;
       })
     })

   @method createRecord
   @param {DS.Store} store
   @param {subclass of DS.Model} type
   @param {DS.Model} record
   @return {Promise} promise
   */
  createRecord: function (store, type, record) {
    var promise = this._super(store, type, record);

    promise.then(function () {
      var relationShips = Ember.get(type, 'relationshipNames');
      if (relationShips.belongsTo) {
        relationShips.belongsTo.forEach(function (relationship) {
          var belongsToRecord = record.get(relationship);
          if (belongsToRecord) {
            var hasManyName = store.findHasManyRelationshipName(
              belongsToRecord.constructor,
              record
            );
            belongsToRecord.get(hasManyName).addObject(record);
          }
        })
      }
    });

    return promise;
  }
})
FactoryGuyTestMixin = Em.Mixin.create({

  // Pass in the app root, which typically is App.
  setup: function(app) {
    this.set('container', app.__container__);
    return this;
  },

  useFixtureAdapter: function(app) {
    app.ApplicationAdapter = DS.FixtureAdapter;
    this.getStore().adapterFor('application').simulateRemoteResponse = false;
  },

  /**
   Proxy to store's find method

   @param {String or subclass of DS.Model} type
   @param {Object|String|Integer|null} id
   @return {Promise} promise
   */
  find: function(type, id) {
    return this.getStore().find(type, id);
  },

  make: function(name, opts) {
    return this.getStore().makeFixture(name, opts);
  },

  getStore: function () {
    return this.get('container').lookup('store:main');
  },

  pushPayload: function(type, hash) {
    return this.getStore().pushPayload(type, hash);
  },

  pushRecord: function(type, hash) {
    return this.getStore().push(type, hash);
  },

  /**
    Using mockjax to stub an http request.

    @param {String} url request url
    @param {Object} json response
    @param {Object} options ajax request options
   */
  stubEndpointForHttpRequest: function (url, json, options) {
    options = options || {};
    var request = {
      url: url,
      dataType: 'json',
      responseText: json,
      type: options.type || 'GET',
      status: options.status || 200
    }

    if (options.data) {
      request.data = options.data
    }

    $.mockjax(request);
  },

  /**
    Handling ajax POST ( create record ) for a model

    @param {String} name of the fixture ( or model ) to create
    @param {Object} opts fixture options
   */
  handleCreate: function (name, opts) {
    var model = FactoryGuy.lookupModelForFixtureName(name);
    this.stubEndpointForHttpRequest(
      "/" + Em.String.pluralize(model),
      this.buildAjaxCreateResponse(name, opts),
      {type: 'POST'}
    )
  },

  /**
    Build the json used for creating record

    @param {String} name of the fixture ( or model ) to create
    @param {Object} opts fixture options
¬  */
  buildAjaxCreateResponse: function (name, opts) {
    var fixture = FactoryGuy.build(name, opts);
    var model = FactoryGuy.lookupModelForFixtureName(name);
    var hash = {};
    hash[model] = fixture;
    return hash;
  },

  /**
    Handling ajax PUT ( update record ) for a model type

    @param {String} root modelType like 'user' for User
    @param {String} id id of record to update
   */
  handleUpdate: function (root, id) {
    this.stubEndpointForHttpRequest(
      "/" + Em.String.pluralize(root) + "/" + id, {}, {type: 'PUT'}
    )
  },

  /**
    Handling ajax DELETE ( delete record ) for a model type

    @param {String} root modelType like 'user' for User
    @param {String} id id of record to update
   */
  handleDelete: function (root, id) {
    this.stubEndpointForHttpRequest(
      "/" + Em.String.pluralize(root) + "/" + id, {}, {type: 'DELETE'}
    )
  },

  teardown: function () {
    FactoryGuy.resetModels(this.getStore());
  }
})