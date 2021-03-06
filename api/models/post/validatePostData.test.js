import validatePostData from './validatePostData'

describe('validatePostData', () => {
  var user, inCommunity, notInCommunity

  before(function () {
    inCommunity = new Community({slug: 'foo', name: 'Foo'})
    notInCommunity = new Community({slug: 'bar', name: 'Bar'})
    user = new User({name: 'Cat', email: 'a@b.c'})
    return Promise.join(
      inCommunity.save(),
      notInCommunity.save(),
      user.save()
    ).then(function () {
      return user.joinCommunity(inCommunity)
    })
  })

  it('fails if no name is provided', () => {
    const fn = () => validatePostData(null, {})
    expect(fn).to.throw(/title can't be blank/)
  })

  it('fails if an invalid type is provided', () => {
    const fn = () => validatePostData(null, {name: 't', type: 'thread'})
    expect(fn).to.throw(/not a valid type/)
  })

  it('fails if no community_ids are provided', () => {
    const fn = () => validatePostData(null, {name: 't'})
    expect(fn).to.throw(/no communities specified/)
  })

  it('fails if there is a community_id for a community user is not a member of', () => {
    const data = {name: 't', community_ids: [inCommunity.id, notInCommunity.id]}
    return validatePostData(user.id, data)
    .catch(function (e) {
      expect(e.message).to.match(/unable to post to all those communities/)
    })
  })

  it('fails if a blank name is provided', () => {
    const fn = () => validatePostData(null, {name: '   ', community_ids: [inCommunity.id]})
    expect(fn).to.throw(/title can't be blank/)
  })

  it('fails if there are more than 3 topicNames', () => {
    const fn = () => validatePostData(null, {
      name: 't',
      community_ids: [inCommunity.id],
      topicNames: ['la', 'ra', 'bar', 'far']})
    expect(fn).to.throw(/too many topics in post, maximum 3/)
  })

  it('continues the promise chain if name is provided and user is member of communities', () => {
    const data = {name: 't', community_ids: [inCommunity.id]}
    return validatePostData(user.id, data)
    .catch(() => expect.fail('should resolve'))
  })

  it('continues the promise chain if valid type is provided', () => {
    const data = {name: 't', type: Post.Type.PROJECT, community_ids: [inCommunity.id]}
    return validatePostData(user.id, data)
    .catch(() => expect.fail('should resolve'))
  })
})
