var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {
    var usersRoute = router.route('/users');

    usersRoute.get(async function (req, res) {
        try {
            let query = User.find(); 
            
            //where
            if (req.query.where) {
                try {
                    const whereClause = JSON.parse(req.query.where);
                    query = query.where(whereClause);                
                }  catch (err) {
                    return res.status(400).json({ message: 'Invalid JSON in where parameter', data: {} });
                } 
            } 

            //sort
            if (req.query.sort) {
                try {
                    const sortClause = JSON.parse(req.query.sort);
                    query = query.sort(sortClause);                
                }  catch (err) {
                    return res.status(400).json({ message: 'Invalid JSON in sort parameter', data: {} });
                }
            }

            //select
            if (req.query.select) {
                try {
                    const selectClause = JSON.parse(req.query.select);
                    query = query.select(selectClause);                
                }  catch (err) {
                    return res.status(400).json({ message: 'Invalid JSON in select parameter', data: {} });
                }
            }

            //skip
            if (req.query.skip) {
                const skipNumber = parseInt(req.query.skip);
                if (!isNaN(skipNumber)) {
                    query = query.skip(skipNumber);
                }
            }

            //limit
            if (req.query.limit) {
                const limitNumber = parseInt(req.query.limit);
                if (!isNaN(limitNumber)) {
                    query = query.limit(limitNumber);
                }
            }
            
            //count
            if (req.query.count == 'true') {
                const count = await User.countDocuments(query.getFilter());
                return res.status(200).json({ message: 'OK', data: count });
               
            }

            //execute
            const users = await query.exec();
            res.status(200).json({ message: 'OK', data: users });


        }
        catch (err) { 
            res.status(500).json({ message: 'Server Error', data: {} });
        }
    });

    usersRoute.post(async function (req, res) {
        try {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({ message: 'Name and email are required', data: {} });
            }

            const existingUser = await User.findOne({ email: req.body.email });
            if (existingUser) {
                return res.status(400).json({ message: 'Email already exists', data: {} });
            }

            const pendingTasks = req.body.pendingTasks || [];

            if (pendingTasks.length > 0) {
                for (let taskId of pendingTasks) {
                    try { 
                        const task = await Task.findById(taskId);
                        if (!task) {
                            return res.status(400).json({ message: `Task with ID ${taskId} does not exist`, data: {} });
                        }

                        if (task.completed) {
                            return res.status(400).json({ message: `Task with ID ${taskId} is already completed and cannot be assigned`, data: {} });
                        }

                        if (task.assignedUser && task.assignedUser !== '') {
                            return res.status(400).json({ message: `Task with ID ${taskId} is already assigned to another user`, data: {} });
                        }

                    } catch (err) {
                        return res.status(400).json({ message: `Invalid Task ID: ${taskId}`, data: {} }); 
                    } 
                }
            }

            const user = new User({
                name: req.body.name, 
                email: req.body.email, 
                pendingTasks: pendingTasks
            }); 

            const savedUser = await user.save();
            
            if (pendingTasks.length > 0) {
                for (let taskId of pendingTasks) {

                    await Task.findByIdAndUpdate(taskId, {
                        assignedUser: savedUser._id.toString(),
                        assignedUserName: savedUser.name
                    });
                }
            }

            res.status(201).json({ message: 'User created', data: savedUser });

            
        } catch (err) {
            res.status(500).json({ message: 'Server Error', data: {} });
        }
    
    });

    var userIdRoute = router.route('/users/:id'); 

    userIdRoute.get(async function (req, res) { 
        try {
            let query = User.findById(req.params.id);

            if (req.query.select) {
                try {
                    const selectClause = JSON.parse(req.query.select);
                    query = query.select(selectClause);                
                } catch (err) { 
                    return res.status(400).json({ message: 'Invalid JSON in select parameter', data: {} });
                }
            } 

            const user = await query.exec();

            if (!user) { 
                return res.status(404).json({ message: 'User not found', data: {} });
            } 
            
            res.status(200).json({ message: 'OK', data: user });

        } catch (err) {
            res.status(404).json({ message: 'User not found', data: {} });
        }

    });

    userIdRoute.put(async function (req, res) {
        try {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({ message: 'Name and email are required', data: {} });
            } 
            
            const existingUser = await User.findById(req.params.id);
            if (!existingUser) {
                return res.status(404).json({ message: 'User not found', data: {} });
            }

            // Check for duplicate email only if the email is being changed
            if (existingUser.email !== req.body.email) {
                const duplicateEmail = await User.findOne({
                    email: req.body.email,
                    _id: { $ne: req.params.id }
                }); 
                if (duplicateEmail) { 
                    return res.status(400).json({ message: 'Email already exists', data: {} });
                } 
            }

            const newPendingTasks = req.body.pendingTasks || [];
            
            // Validate new pending tasks
            if (newPendingTasks.length > 0) {
                for (let taskId of newPendingTasks) { 
                    try { 
                        const task = await Task.findById(taskId); 
                        if (!task) {
                            return res.status(400).json({ message: `Task with ID ${taskId} does not exist`, data: {} });
                        } 

                        if (task.completed) {
                            return res.status(400).json({ message: `Task with ID ${taskId} is already completed and cannot be assigned`, data: {} });
                        }
                            
                        if (task.assignedUser && task.assignedUser !== '' && task.assignedUser !== req.params.id) {
                            return res.status(400).json({ message: `Task with ID ${taskId} is already assigned to another user`, data: {} });
                        } 
                    } catch (err) {
                        return res.status(400).json({ message: `Invalid Task ID: ${taskId}`, data: {} });
                    }   
                }
            }

`   `        // Handle removed tasks
            const oldPendingTasks = existingUser.pendingTasks || [];
            const removedTasks = oldPendingTasks.filter(t => !newPendingTasks.includes(t));
            for (let taskId of removedTasks) {
                await Task.findByIdAndUpdate(taskId, {
                    assignedUser: '',
                    assignedUserName: 'unassigned'
                }); 
            }

            // Handle newly assigned tasks
            for (let taskId of newPendingTasks) {
                const task = await Task.findById(taskId);
                if (task) {
                    if (task.assignedUser && task.assignedUser !== req.params.id && task.assignedUser !== '') {
                        await User.findByIdAndUpdate(task.assignedUser, {
                            $pull: { pendingTasks: taskId }
                        }); 

                    }

                    await Task.findByIdAndUpdate(taskId, {
                            assignedUser: req.params.id,
                            assignedUserName: req.body.name
                        });
                }
            }

            const updatedUser = await User.findByIdAndUpdate(
                req.params.id,  
                {
                    name: req.body.name, 
                    email: req.body.email, 
                    pendingTasks: newPendingTasks
                },
                { new: true }  
            );

            res.status(200).json({ message: 'User updated', data: updatedUser });

        } catch (err) { 
            res.status(500).json({ message: 'Server Error', data: {} });
        }

    });

    userIdRoute.delete(async function (req, res) {
        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: {} });
            }
            
            // Unassign all tasks assigned to this user
            if (user.pendingTasks && user.pendingTasks.length > 0) {
                for (let taskId of user.pendingTasks) {
                    await Task.findByIdAndUpdate(taskId, {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    });
                }        
            }

            await User.findByIdAndDelete(req.params.id);

            return res.status(204).send(); 
        } catch (err) {
            return res.status(404).json({ message: 'User not found', data: {} });
        }

    });

    return router;


};

