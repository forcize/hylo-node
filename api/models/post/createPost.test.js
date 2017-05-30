import { afterCreatingPost } from './createPost'
const rootPath = require('root-path')
const setup = require(rootPath('test/setup'))
const factories = require(rootPath('test/setup/factories'))
const { spyify, stubGetImageSize, unspyify } = require(rootPath('test/setup/helpers'))

describe('afterCreatingPost', () => {
  var post
  const videoUrl = 'https://www.youtube.com/watch?v=jsQ7yKwDPZk'

  before(() => setup.clearDb().then(() => Tag.forge({name: 'request'}).save()))

  beforeEach(() => {
    post = factories.post({description: 'wow!'})
    spyify(Queue, 'classMethod')
  })

  after(() => unspyify(Queue, 'classMethod'))

  it('works', () => {
    return Media.generateThumbnailUrl(videoUrl)
    .then(url => stubGetImageSize(url))
    .then(() => bookshelf.transaction(trx =>
      post.save({}, {transacting: trx})
      .then(() =>
        afterCreatingPost(post, {
          communities: [],
          videoUrl,
          children: [
            {
              id: 'new-whatever',
              name: 'bob',
              description: 'is your uncle'
            }
          ],
          transacting: trx
        }))))
    .then(() => post.load(['media', 'children']))
    .then(() => {
      const video = post.relations.media.first()
      expect(video).to.exist
      expect(video.get('url')).to.equal(videoUrl)

      const child = post.relations.children.first()
      expect(child).to.exist
      expect(child.get('name')).to.equal('bob')
      expect(child.get('description')).to.equal('is your uncle')

      expect(Queue.classMethod).to.have.been.called
      .with('Post', 'createActivities', {postId: post.id})
    })
  })

  it('ignores duplicate community ids', () => {
    const c = factories.community()
    return c.save()
    .then(() => post.save())
    .then(() => afterCreatingPost(post, {community_ids: [c.id, c.id]}))
    .then(() => post.load('communities'))
    .then(() => expect(post.relations.communities.length).to.equal(1))
    .catch(err => {
      throw err
    })
  })
})