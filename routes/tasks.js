var Task = require('../models/task');
var User = require('../models/user');

module.exports = function (router) {
    var taskRoute = router.route('/tasks');

    taskRoute.get(async function (req, res) {
        try { 
            let query = Task.find(); 

            if (req.query.where) {
                try {
                    const whereClause = JSON.parse(req.query.where);
                    query = query.where(whereClause); 
                } catch (err) {  
                    return res.status(400).json({ message: 'Invalid JSON in where parameter' , data: {}});
                } 
            }

            if (req.query.sort) {
                try {
                    const sortClause = JSON.parse(req.query.sort); 
                    query = query.sort(sortClause);
                } catch (err) {
                    return res.status(400).json({ message: 'Invalid JSON in sort parameter' , data: {}});
                }
            }

            if (req.query.select) {
                try {
                    const selectClause = JSON.parse(req.query.select); 
                    query = query.select(selectClause);
                } catch (err) {
                    return res.status(400).json({ message: 'Invalid JSON in select parameter' , data: {}});
                }
            }

            if (req.query.skip) {
                const skipValue = parseInt(req.query.skip);
                if (!isNaN(skipValue)) {
                    query = query.skip(skipValue);
                }
            }
            
            
            const limitValue = req.query.limit ? parseInt(req.query.limit) : 100;
            if (!isNaN(limitValue)) { 
                query = query.limit(limitValue);
            }
            
            if (req.query.count === 'true') {
                const count = await Task.countDocuments(query.getFilter());
                return res.status(200).json({ message: 'OK', data: count });
            }

            const tasks = await query.exec();
            return res.status(200).json({ message: 'OK', data: tasks });
        } catch (err) { 
            return res.status(500).json({ message: 'Server Error', data: {} });
        }

    });

    taskRoute.post(async function (req, res) {
        try {
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({ message: 'Missing required fields: name and deadline', data: {} });
            }

            let assignedUserName = 'unassigned';
            let assignedUser = '';
            const completed = req.body.completed === 'true' || req.body.completed === true || false;

            if (req.body.assignedUser) {
                // Prevent assigning completed tasks
                if (completed) {
                    return res.status(400).json({ message: 'Cannot assign a user to a completed task', data: {} });
                }

                try {
                    const user = await User.findById(req.body.assignedUser);
                    if (!user) {
                        return res.status(400).json({ message: 'Assigned user not found', data: {} });
                    }

                    if (req.body.assignedUserName && req.body.assignedUserName !== user.name) {
                        return res.status(400).json({ message: 'Assigned user name does not match user ID', data: {} });
                    }

                    assignedUserName = user.name;
                    assignedUser = user._id;
                } catch (err) {
                    return res.status(400).json({ message: 'Invalid assigned user ID', data: {} });
                }
            }

            const newTask = new Task({
                name: req.body.name,
                description: req.body.description || '',
                deadline: req.body.deadline,
                completed: completed, 
                assignedUserName: assignedUserName, 
                assignedUser: assignedUser,
            });

            const savedTask = await newTask.save();
            if (savedTask.assignedUser && !savedTask.completed) {
                await User.findByIdAndUpdate(
                    savedTask.assignedUser,
                    { $addToSet: { pendingTasks: savedTask._id.toString() } }
                );
            }

            return res.status(201).json({ message: 'Task created', data: savedTask });


        } catch (err) {
            return res.status(500).json({ message: 'Server Error', data: {} });
        }
    });

    var taskIdRoute = router.route('/tasks/:id');

    taskIdRoute.get(async function (req, res) {
        try {
            let query = Task.findById(req.params.id);
            
            if (req.query.select) {
                try {
                    const selectClause = JSON.parse(req.query.select);
                    query = query.select(selectClause);
                } catch (err) { 
                    return res.status(400).json({ message: 'Invalid JSON in select parameter', data: {} });
                }
            }

            const task = await query.exec();

            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }

            res.status(200).json({ message: 'OK', data: task });
        } catch (err) {
            return res.status(404).json({ message: 'Task not found', data: {} });
        }
    });

    taskIdRoute.put(async function (req, res) {
        try {
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({ message: 'Missing required fields: name and deadline', data: {} });
            }

            const existingTask = await Task.findById(req.params.id);
            if (!existingTask) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }

            const oldAssignedUser = existingTask.assignedUser;
            const oldCompleted = existingTask.completed;
            const newCompleted = req.body.completed === 'true' || req.body.completed === true || false;

            let newAssignedUserName = 'unassigned';
            let newAssignedUser = '';

            //validate new assigned user if provided
            if (req.body.assignedUser) {
                // Prevent assigning users to tasks that are currently completed
                if (oldCompleted) {
                    return res.status(400).json({ message: 'Cannot assign a user to a completed task', data: {} });
                }
                // Prevent assigning users to tasks that will be marked as completed
                if (newCompleted) {
                    return res.status(400).json({ message: 'Cannot assign a user to a completed task', data: {} });
                }

                try {
                    const user = await User.findById(req.body.assignedUser);
                    if (!user) {
                        return res.status(400).json({ message: 'Assigned user not found', data: {} });
                    }

                    if (req.body.assignedUserName && req.body.assignedUserName !== user.name) {
                        return res.status(400).json({ message: 'Assigned user name does not match user ID', data: {} });
                    } 

                    newAssignedUser = req.body.assignedUser;
                    newAssignedUserName = user.name;
                } catch (err) {
                    return res.status(400).json({ message: 'Invalid assigned user ID', data: {} });
                }
            }

            //remove old user pending task if changed or completed
            if (oldAssignedUser && (oldAssignedUser !== newAssignedUser ||(!oldCompleted && newCompleted))) {
                await User.findByIdAndUpdate(oldAssignedUser, { $pull: { pendingTasks: req.params.id } });
            }


            //update new user'spending tasks if changed and not completed
            if (newAssignedUser && newAssignedUser !== oldAssignedUser && !newCompleted) {
                await User.findByIdAndUpdate(newAssignedUser, { $addToSet: { pendingTasks: req.params.id } });
            }

            //update the task
            const updatedTask = await Task.findByIdAndUpdate(
                req.params.id,
                {
                    name: req.body.name,
                    description: req.body.description || '',
                    deadline: req.body.deadline,
                    completed: newCompleted,
                    assignedUserName: newAssignedUserName,
                    assignedUser: newAssignedUser,
                },
                { new: true }
            );

            return res.status(200).json({ message: 'Task updated', data: updatedTask });
        } catch (err) {
            return res.status(500).json({ message: 'Internal Service Error', data: {} });       
        }

    });

    taskIdRoute.delete(async function (req, res) {
        try {
            const task = await Task.findById(req.params.id);
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }

            //emove task from assigned user's pending tasks
            if (task.assignedUser) {
                await User.findByIdAndUpdate(task.assignedUser, { $pull: { pendingTasks: req.params.id } }); 
            }

            await Task.findByIdAndDelete(req.params.id);
            return res.status(204).send();

        } catch (err) {
            return res.status(404).json({ message: 'Task Not Found', data: {} });
        }
    });
    
    return router;



};



