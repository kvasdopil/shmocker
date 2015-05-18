# What is this
Shmocker project is an attempt to emulate docker containering software for FreeBSD.

The docker is a great project, one of the biggest flaws it has - lack of FreeBSD support. To run doker on FreeBSD we need several improvements to this project:

* graphdriver - layer that will emulate docker union file system and provide filesystem layers functionality. On FreeBSD this can be done easily with ZFS. Actually zfs graphdriver is already in docker/master branch, and it works on FreeBSD with minor changes.
* execdriver - layer that deals with container execution. FreeBSD got jails, so this should not be hard to implement. There's a implementation of jail execdriver from @kzys, but it's very preliminary and need a lot of improvement.
* networkdriver - layer that will be dealing with network port mappings etc. Not quite sure if it must be rewritten for FreeBSD, but if so, PF should be suitable.

# Ehmm. So why not fork a docker?

While investigating opportunities of creatings docker drivers, getting along with go, etc. I came with idea of writing simple script that will be doing the same things the docker does i.e. kinda emulate docker behavior to find out if FreeBSD has all the technologies required and what should be done to write an actual driver. Besides now i'll be able to use this docker-ish technology for my primary job, and can evaluate pros and cons of migrating to container infrastructure right now.

So this quick-and-dirty script appeared and, surprisingly, it already can do a lot of things docker can, i.e.:

* image loading\saving
* container creation, committing to image, all that copy-on-write stuff
* jail execution (with some caveats)

Still not working:
* volumes
* port mappings
* tags
* repository functions

But hey, there was only couple of days of work;)

# PHP? Are you kidding me?
Yep, sorry for that. But remember, this is just a prototype for testing purposes intended to be written quick-and-just-working way.

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

