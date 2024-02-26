const mongoose = require('mongoose');
const userSchema=new mongoose.Schema({
    chatId:{
        type:Number,
        trim:true,
        required:true
    },
    username:{
        type:String,
        trim:true
    },
    chat_type:{
        type:String,
        trim:true
    },
    city:{
        type:String,
        trim:true,
    },
    country:{
        type:String,
        trim:true
    },
    last_text:{
       type:String,
       trim:true,
       default:'user last text'  
    },
    Date:{
        type:Date,
        default:Date.now
    }
    
})



const User = mongoose.model('User', userSchema);

module.exports = User;