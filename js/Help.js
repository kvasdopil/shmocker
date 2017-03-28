const util = require('util');

const commands = [
  { name: "build",         desc: "Build dockerfile",                                                 usage: "DOCKERFILE" },
  { name: "bootstrap",     desc: "Initialize shmocker environment",                                  usage: "ZFSROOT" },
  { name: "create",        desc: "Create a new stopped container",                                   usage: "REPOSITORY" },
  { name: "cp",            desc: "Copy a file to container",                                         usage: "FROM TO" },
  { name: "commit",        desc: "Create a new image from a container's changes",                    usage: "CONTAINER REPOSITORY" },
  { name: "diff",          desc: "Inspect changes on a container's filesystem",                      usage: "[OPTIONS] CONTAINER" },
  { name: "exec",          desc: "Run a command in a running container",                             usage: "CONTAINER COMMAND [ARG...]" },
  { name: "export",        desc: "Export the contents of a container's filesystem as a tar archive", usage: "[OPTIONS] CONTAINER" },
  { name: "images",        desc: "List images",                                                      usage: "[REPOSITORY]" },
  { name: "import",        desc: "Load an image from tar file",                                      usage: "FILE" },
  { name: "kill",          desc: "Kill a running container using SIGKILL or a specified signal",     usage: "[OPTIONS] CONTAINER [CONTAINER...]" },
  { name: "load",          desc: "Load an image from STDIN",                                         usage: "" },
  { name: "ps",            desc: "List containers",                                                  usage: "" },
  { name: "rename",        desc: "Rename a existing container to a NEW_NAME",                        usage: "OLD_NAME NEW_NAME" },
  { name: "rm",            desc: "Remove one or more containers",                                    usage: "CONTANIER [CONTAINER...]" },
  { name: "rmi",           desc: "Remove one or more images",                                        usage: "IMAGE [IMAGE...]" },
  { name: "run",           desc: "Run a command in a new container",                                 usage: "IMAGE [COMMAND] [ARG...]" },
  { name: "save",          desc: "Save an image to STDOUT",                                          usage: "IMAGE" },
  { name: "start",         desc: "Start a stopped container",                                        usage: "CONTANIER [CONTAINER...]" },
  { name: "stop",          desc: "Stop a running container",                                         usage: "CONTANIER [CONTAINER...]" },
  { name: "tag",           desc: "Tag an image into a repository",                                   usage: "docker tag [OPTIONS] IMAGE[:TAG] NAME[:TAG]" },
  { name: "version",       desc: "Show the shmocker version information",                            usage: "" },
  { name: "volume create", desc: "Create a volume",                                                  usage: "[OPTIONS]" },
  { name: "volume rm",     desc: "Remove a volume",                                                  usage: "[OPTIONS] VOLUME [VOLUME...]" },
  { name: "volume ls",     desc: "List volumes",                                                     usage: "[OPTIONS]" },
  { name: "wipe",          desc: "Remove stopped containers",                                        usage: "" },
]

const pads = (str, len, char = ' ') => char.repeat(len - str.length) + str;

class Help
{
  show(cmd)
  {
    if(cmd !== false)
    {
      const info = commands.filter(c => c.name == cmd);
      if(info.length)
      {
        console.log();
        console.log(`Usage: docker ${cmd} ${info[0].usage}`);
        console.log();
        console.log(info[0].desc);
        return;
      }

      console.error("Error: Command not found: " + cmd);
    }

    console.log("Usage: shmocker COMMAND [arg...]");
    console.log();
    console.log("A kinda docker clone for FreeBSD");
    console.log();
    console.log("Commands:");
    commands.map(c =>
      console.log(util.format("%s %s", pads(c.name, 15), c.desc))
    )
  }
}

module.exports = Help;