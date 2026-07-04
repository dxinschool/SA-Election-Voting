# School Student Association Election Voting System Project

## 1. System Analysis

### Student Flow

1. Start
2. Student login
3. Show student vote status
4. Show candidate list (no vote counts shown)
5. Student chooses one to vote or changes their vote
6. Submit
7. Return to home page
8. End

### Election Flow

1. Start
2. Count votes of each candidate
3. Disable voting when deadline
4. Determine winner
   - **Condition**: If top candidates received the same number of votes → Eliminate all others and vote for second round → Return to "Count votes of each candidate"
5. Show total votes of each candidate in each round
6. End

### System Rules

- **Candidates**: Name, member names, short description of goals
- **Voting**: Anonymous, 1 vote per student, can change before deadline. Candidates cannot vote
- **Results**:
  - Count total votes of all candidates
  - Most votes win
  - Same votes: Eliminate all others and vote for second round
  - Check total votes from each candidate match actual total votes

## 2. ER Diagram

### Entities and Attributes

- **Student**: 
  - Student ID (Key)
  - Student name
  - Vote status
  - Email

- **Candidate**: 
  - Candidate ID (Key)
  - Candidate name
  - Votes
  - Description

- **Members**: 
  - Student ID (Key)
  - Member name
  - position

### Relationships

- **Student [M]** --- (Vote) --- **[1] Candidate**
- **Candidate [1]** --- (Has) --- **[M] Members**

## 3. Database Schema

### Tables

- **Student** (SID, SNAME, VSTATUS, EMAIL)
- **Candidate** (CID, CNAME, VOTES, DESC)
- **Members** (CID, SID, MNAME, POSITION)

### Foreign Keys

- **CID** (references Candidate table)