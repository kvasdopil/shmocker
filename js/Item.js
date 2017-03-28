class Item {
  constructor(server, id)
  {
    this.id = id;
    this.server = server;
    this.mountpoint = `/mnt/${id}`;
    this.path = server.storage.getPath();
  }

  getOrigin()
  {
    const parent = this.prop("origin");

    if(parent === false)
      return false;

    const m = /images\/(.+)@ok/.exec(parent);
    if(!m)
      return false;

    return m[1];
  }

  prop(name)
  {
    return this.server.storage.getProp(this.id, name);
  }
}

module.exports = Item;