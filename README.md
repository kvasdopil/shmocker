# What is this
Shmocker project is an attempt to emulate docker containering software for FreeBSD.

The docker is a great project, one of the biggest flaws it has is the lack of FreeBSD support. To run doker on FreeBSD we need several improvements to this project:

* graphdriver - layer that will emulate docker union file system and provide filesystem layers functionality. On FreeBSD this can be done easily with ZFS. Actually zfs graphdriver is already in docker/master branch, and it works on FreeBSD with minor changes.
* execdriver - layer that deals with container execution. FreeBSD got jails, so this should not be hard to implement. There's a implementation of jail execdriver from @kzys, but it's very preliminary (i.e. not working at all).
* networkdriver - layer that will be dealing with network port mappings\NAT\bridge driver etc. This also needs to be rewritten for FreeBSD.

# Ehmm. So why not fork a docker?

That's not so simple. Despite some huge cross-platform-ready refactorings, some parts of docker still rely on linux subsystems too much, and a lot of careful work should be done just to compile it on bsd. Currently I don't have enough spare time for this and nobody else seem to did it since 2015.

In other hands, while investigating opportunities of creatings docker drivers, getting along with go, etc. I came with idea of writing simple script that will be doing the same things the docker does. This kinda docker emulatior can help to find out if FreeBSD has all the technologies required and what should be done to write actual drivers. Besides with it I'll be able to use this docker-ish technology for my primary job tasks, and can evaluate pros and cons of migrating to container infrastructure right now.

So this quick-and-dirty script appeared and, surprisingly, it already can do a lot of things docker can, i.e.:

* image loading\saving
* container creation, committing to image, all that copy-on-write stuff
* jail execution (with some caveats)
* volumes
* networking

Still not working:
* named volumes
* port mappings
* tags
* repository functions

# So how to use this?
First you need to run (as a root):

    # ./chmod 700 shmocker
    # zfs create -omountpoint=legacy zroot/shmocker
    # ./shmoker bootstrap zroot/shmocker

This should create required zfs partitons and mark them as usable for shmocker. Besides this will create lo1 network interface with 172.0.0.1/24 address.

Next you'll need an image.

    # ./shmocker fetch freebsd-10.1
    # ./shmocker images

    REPOSITORY          TAG                 IMAGE ID            CREATED             VIRTUAL SIZE
    freebsd-10.1        -                   74920515153c        2015-05-18 18:28:36 351M

Now create a container and run it

    # ./shmocker run freebsd-10.1 csh

# Contributing

Please feel free to use the script or modify it, any comments are welcomed.
