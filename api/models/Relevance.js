var Serendipity = require('../..//lib/serendipity'),
  striptags = require('striptags');

module.exports = bookshelf.Model.extend({
  tableName: 'user_post_relevance',

  user: function() {
    return this.belongsTo(User);
  },

  post: function() {
    return this.belongsTo(Post);
  }

}, {

  initSerendipity: function() {
    var s = new Serendipity();
    return Promise.promisify(s.initFromUrl, s)(process.env.LSA_DATA_URL)
    .then(() => s);
  },

  upsert: function(userId, postId, similarity) {
    return new Relevance({
      user_id: userId,
      post_id: postId,
      similarity: similarity,
      created_at: new Date()
    }).save()
    .catch(err => {
      if (!err.message || !err.message.contains('duplicate key')) throw err;

      return Relevance.query().where({
        user_id: userId,
        post_id: postId
      }).update({similarity: similarity, updated_at: new Date()});
    });
  },

  wordsForUser: function(user) {
    return striptags(_.flatten([
      user.relations.posts.map(p => _.values(p.pick('title', 'description'))),
      user.relations.organizations.map(o => o.get('org_name')),
      user.relations.skills.map(o => o.get('skill_name')),
      _.values(user.pick('bio', 'work', 'intention', 'extra_info'))
    ]).join(' '));
  },

  wordsForPost: function(post) {
    return striptags(_.values(post.pick('title', 'description')).join(' '));
  },

  generateForUser: function(userId, serendipity) {
    var self = this, user, userVector;

    return User.find(userId, {withRelated: ['posts', 'organizations', 'skills']})
    .tap(u => user = u)
    .tap(u => userVector = serendipity.docVector(self.wordsForUser(u)))
    .then(user => Promise.join(
      Membership.activeCommunityIds(userId),
      Network.activeCommunityIds(userId)
    ))
    .then(results => Search.forPosts({
      community: _.union(results[1], results[2]),
      excludeUsers: [userId]
    }).fetchAll())
    .then(posts => Promise.map(posts.models, post =>
      Relevance.upsert(userId, post.id,
        serendipity.similarity(
          userVector,
          serendipity.docVector(self.wordsForPost(post))))));
  },

  generateForPost: function(postId, serendipity) {
    var self = this, post, postVector;

    return Post.find(postId, {withRelated: ['communities']})
    .tap(p => post = p)
    .tap(p => postVector = serendipity.docVector(self.wordsForPost(p)))
    .then(post => Community.query().select('id')
      .whereIn('network_id', post.relations.communities.pluck('network_id')))
    .then(rows => Search.forUsers({
      exclude: [post.get('creator_id')],
      community: _.union(post.relations.communities.pluck('id'), _.pluck(rows, 'id')),
      limit: 1000000
    }).fetchAll({withRelated: ['posts', 'organizations', 'skills']}))
    .then(users => Promise.map(users.models, user =>
      Relevance.upsert(user.id, postId,
        serendipity.similarity(
          serendipity.docVector(self.wordsForUser(user)),
          postVector))));

  },

  generateForNewPosts: function(startTime, endTime, serendipity) {
    var self = this;
    return Post.query().select('id')
      .whereRaw('updated_at between ? and ?', [startTime, endTime])
    .then(rows => _.pluck(rows, 'id'))
    .then(ids => Promise.map(ids, id => {
      sails.log.debug('generating relevance scores for post ' + id);
      return self.generateForPost(id, serendipity);
    }, {concurrency: Number(process.env.RELEVANCE_CONCURRENCY)}));
  }

});
